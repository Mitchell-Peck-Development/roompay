import { type ISODate, type Period, dateInPeriod, ordinal } from "./dates"
import { type Cents, splitEven } from "./money"
import type { Cadence } from "./schema"

export type PlanPayment = { date: ISODate; amountCents: Cents; label: string }

export type Plan = {
  key: string
  name: string
  description?: string
  payments: PlanPayment[]
}

/** A share of more than this fraction in one payment gets flagged as heavy. */
const GENTLE_FRACTION = 0.55

function uniqueSorted(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b)
}

export function paymentLabel(index: number, count: number): string {
  return count === 1 ? "Full amount" : `Payment ${index + 1} of ${count}`
}

/** Equal payments on the given dates; odd cents go to the earliest. */
export function scheduleEvenly(total: Cents, dates: ISODate[]): PlanPayment[] {
  const unique = [...new Set(dates)].sort()
  const amounts = splitEven(total, unique.length)
  return unique.map((date, i) => ({
    date,
    amountCents: amounts[i]!,
    label: paymentLabel(i, unique.length),
  }))
}

export function describeCadence(days: number[]): string {
  const list = uniqueSorted(days).map(ordinal)
  if (list.length === 0) return ""
  if (list.length === 1) return `Due on the ${list[0]}.`
  if (list.length === 2) return `Half on the ${list[0]}, half on the ${list[1]}.`
  const head = list.slice(0, -1).join(", ")
  return `${list.length} equal payments: ${head} and ${list.at(-1)}.`
}

/**
 * One plan per cadence for a share due in `period`. Days past the end of a
 * short month clamp to its last day, and days that collide are merged.
 */
export function buildPlans(
  shareCents: Cents,
  cadences: Cadence[],
  period: Period
): Plan[] {
  return cadences.map((cadence) => ({
    key: cadence.key,
    name: cadence.name,
    description: describeCadence(cadence.days),
    payments: scheduleEvenly(
      shareCents,
      uniqueSorted(cadence.days).map((day) => dateInPeriod(period, day))
    ),
  }))
}

export function largestPayment(plan: Plan): Cents {
  return plan.payments.reduce((max, p) => Math.max(max, p.amountCents), 0)
}

/** True when no single payment is more than ~half of the share. */
export function isGentle(plan: Plan, shareCents: Cents): boolean {
  return largestPayment(plan) <= shareCents * GENTLE_FRACTION
}
