import { z } from "zod"
import type { CatchupResult } from "./catchup"
import { formatWindow, residentDays, windowDays } from "./coverage"
import { type ISODate, periodOf } from "./dates"
import { meterDetail } from "./meter"
import { paidTotal } from "./paid"
import { type Plan, buildPlans } from "./plans"
import { reconcilePlans } from "./reconcile"
import {
  type Cadence,
  type CatchupRecord,
  type MonthRecord,
  type PublishedPlan,
  isoDateSchema,
  periodSchema,
} from "./schema"
import { computeMonth } from "./split"

const cents = z.number().int().min(-1e11).max(1e11)
const text = z.string().max(120)

const paymentSchema = z.object({
  date: isoDateSchema,
  amountCents: cents,
  label: text,
})

const planSchema = z.object({
  key: z.string().min(1).max(64),
  name: text,
  description: z.string().max(200).optional(),
  payments: z.array(paymentSchema).min(1).max(24),
})

export const statementKindSchema = z.enum(["monthly", "catchup"])
export type StatementKind = z.infer<typeof statementKindSchema>

/**
 * What a share link stores: a snapshot computed on the owner's device. The
 * server never does any maths on it. Deliberately has no free-text note and
 * nothing that identifies a person or a payment account.
 */
export const sharePayloadSchema = z
  .object({
    v: z.literal(1),
    kind: statementKindSchema,
    period: periodSchema,
    title: text,
    currency: z.string().length(3),
    lines: z
      .array(
        z.object({
          label: text,
          totalCents: cents,
          shareCents: cents,
          detail: z.string().max(200).optional(),
          /** The service this line pays for, e.g. "August 2026". */
          covers: z.string().max(60).optional(),
          /** Days of that service they were here for, when it isn't all of it. */
          prorated: z
            .object({ days: z.number().int().min(0).max(800), of: z.number().int().min(1).max(800) })
            .optional(),
        })
      )
      .max(60),
    totalCents: cents,
    shareCents: cents,
    plans: z.array(planSchema).min(1).max(12),
    defaultPlan: z.string().min(1).max(64),
    catchup: z
      .object({
        moveIn: isoDateSchema,
        daysOccupied: z.number().int().min(0).max(31),
        daysInMonth: z.number().int().min(28).max(31),
        stubShareCents: cents,
        nextMonthShareCents: cents,
        /** The months this plan settles, so nothing is billed twice. */
        periods: z.array(periodSchema).max(6).optional(),
        /** True while any of it is still an estimate. */
        estimated: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((p) => p.plans.some((plan) => plan.key === p.defaultPlan), {
    message: "defaultPlan must be one of the plans",
    path: ["defaultPlan"],
  })

export type SharePayload = z.infer<typeof sharePayloadSchema>

/** True when a window is exactly the month it's billed in — nothing to say. */
function sameMonth(covers: { start: ISODate; end: ISODate }, period: string): boolean {
  return covers.start === `${period}-01` && periodOf(covers.end) === period
}

function residencyOf(month: MonthRecord, personId: string) {
  const participant = month.participants.find((p) => p.personId === personId)
  return { from: participant?.from, to: participant?.to }
}

export function buildMonthlyPayload(args: {
  month: MonthRecord
  personId: string
  cadences: Cadence[]
  currency: string
  defaultPlanKey?: string
}): SharePayload {
  const { month, personId, cadences, currency, defaultPlanKey } = args
  const computed = computeMonth(month)

  // A roommate sees the lines they have a stake in — not another roommate's
  // parking spot, and not lines that haven't been entered yet.
  const lines = computed.lines
    .filter((l) => l.entered && (l.shares[personId] ?? 0) !== 0)
    .map((l) => {
      const detail =
        l.line.kind === "metered" && l.line.meter
          ? meterDetail(l.line.meter, currency)
          : undefined
      const covers = l.line.covers
      // Billed for service before they arrived? Show the working, so a share
      // that isn't a clean fraction of the bill doesn't look like a mistake.
      const fraction = l.occupancy[personId] ?? 1
      const prorated =
        covers && fraction < 1
          ? {
              days: residentDays(covers, residencyOf(month, personId)),
              of: windowDays(covers),
            }
          : undefined
      return {
        label: l.line.label,
        totalCents: l.amountCents,
        shareCents: l.shares[personId] ?? 0,
        ...(detail ? { detail } : {}),
        ...(covers && !sameMonth(covers, month.period) ? { covers: formatWindow(covers) } : {}),
        ...(prorated ? { prorated } : {}),
      }
    })

  const shareCents = computed.totals[personId] ?? 0
  // Once they've started paying, a corrected bill only moves what they haven't paid yet.
  const plans = reconcilePlans(
    buildPlans(shareCents, cadences, month.period),
    month.published[personId]?.plans,
    paidTotal(month.paid[personId] ?? [])
  )
  const defaultPlan =
    plans.find((p) => p.key === defaultPlanKey)?.key ?? plans[0]?.key ?? ""

  return {
    v: 1,
    kind: "monthly",
    period: month.period,
    title: month.title,
    currency,
    lines,
    totalCents: lines.reduce((a, l) => a + l.totalCents, 0),
    shareCents,
    plans,
    defaultPlan,
  }
}

export function buildCatchupPayload(args: {
  result: CatchupResult
  record: CatchupRecord
  currency: string
}): SharePayload {
  const { result, record, currency } = args
  return {
    v: 1,
    kind: "catchup",
    period: periodOf(record.moveIn),
    title: "Move-in catch-up",
    currency,
    // One row per bill per month, so an offset bill that only lands on the
    // second statement — and lands prorated — reads as its own line.
    lines: result.statements.flatMap((statement) =>
      statement.lines
        .filter((l) => l.shareCents !== 0)
        .map((l) => ({
          label: l.label,
          totalCents: l.fullCents,
          shareCents: l.shareCents,
          covers: formatWindow(l.covers),
          ...(l.occupancy < 1
            ? {
                prorated: {
                  days: residentDays(l.covers, { from: record.moveIn }),
                  of: windowDays(l.covers),
                },
              }
            : {}),
        }))
    ),
    totalCents: result.fullMonthTotalCents,
    shareCents: result.combinedCents,
    plans: [result.plan],
    defaultPlan: result.plan.key,
    catchup: {
      moveIn: record.moveIn,
      daysOccupied: result.daysOccupied,
      daysInMonth: result.daysInMonth,
      stubShareCents: result.stubShareCents,
      nextMonthShareCents: result.nextMonthShareCents,
      periods: result.statements.map((s) => s.period),
      estimated: result.statements.some((s) => s.estimated),
    },
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

// cyrb53 — a small, well-distributed non-cryptographic hash. It only has to
// notice "the numbers changed since this was published".
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

export function payloadHash(payload: SharePayload): string {
  return cyrb53(stableStringify(payload))
}

/** A payload's schedules, as the owner's device keeps them to reconcile against later. */
export function publishedPlans(payload: SharePayload): PublishedPlan[] {
  return payload.plans.map((plan) => ({
    key: plan.key,
    payments: plan.payments.map(({ date, amountCents }) => ({ date, amountCents })),
  }))
}

/** The latest due date across every plan — drives link expiry. */
export function lastDueOn(payload: SharePayload): ISODate {
  return payload.plans
    .flatMap((plan) => plan.payments.map((p) => p.date))
    .reduce((max, date) => (date > max ? date : max), "0000-01-01")
}

/** The first of `keys` that names a plan in the payload, else the first plan. */
export function pickPlan(
  payload: SharePayload,
  ...keys: (string | null | undefined)[]
): Plan {
  for (const key of keys) {
    const plan = payload.plans.find((p) => p.key === key)
    if (plan) return plan
  }
  return payload.plans[0]!
}
