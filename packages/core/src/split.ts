import { residentDays, windowDays } from "./coverage"
import { lineAmountCents } from "./meter"
import { type Cents, allocate } from "./money"
import type {
  ItemSplit,
  MonthLine,
  MonthRecord,
  Participant,
  ServiceWindow,
  Split,
} from "./schema"

/** Key for the owner's share in every per-participant record. */
export const OWNER = "owner"

const BASIS_POINTS = 10_000

function toBasisPoints(pct: number | undefined): number {
  if (!pct || !Number.isFinite(pct)) return 0
  return Math.min(BASIS_POINTS, Math.max(0, Math.round(pct * 100)))
}

/**
 * Allocation weights for a split. Index 0 is always the owner, followed by
 * `personIds` in order. In percent mode the owner takes whatever is left.
 */
export function shareWeights(
  split: Split | ItemSplit,
  personIds: string[]
): number[] {
  switch (split.mode) {
    case "even":
      return [1, ...personIds.map(() => 1)]
    case "percent": {
      const roommates = personIds.map((id) => toBasisPoints(split.pct[id]))
      const taken = roommates.reduce((a, b) => a + b, 0)
      return [Math.max(0, BASIS_POINTS - taken), ...roommates]
    }
    // Evenly among exactly these people. Equal weights, so a credit divides
    // to the cent instead of leaving a fraction of a percent behind.
    case "only": {
      const named = new Set(split.personIds)
      return [named.has(OWNER) ? 1 : 0, ...personIds.map((id) => (named.has(id) ? 1 : 0))]
    }
    // Whoever is on the split this month, except you.
    case "roommates":
      return [0, ...personIds.map(() => 1)]
    default:
      // "exclude" — and "default", which callers resolve before getting here.
      return [1, ...personIds.map(() => 0)]
  }
}

/** Sum of the roommates' percentages (0 for non-percent splits). */
export function splitPctTotal(split: Split | ItemSplit): number {
  if (split.mode !== "percent") return 0
  return Object.values(split.pct).reduce((a, b) => a + (b || 0), 0)
}

/**
 * Occupancy scales each roommate's weight by the share of the line's service
 * window they lived through. What that frees up goes to the owner, who was on
 * the hook for the rest of it — never to the other roommates, who shouldn't
 * pay more because someone moved in late.
 *
 * Weighting is by whole days rather than a rounded fraction, over the window's
 * day count as a common denominator, so the parts still add up to the cent.
 */
function occupancyWeights(
  weights: number[],
  covers: ServiceWindow | undefined,
  participants: Participant[]
): { weights: number[]; fractions: Record<string, number> } {
  const fractions: Record<string, number> = {}
  const total = covers ? windowDays(covers) : 0
  if (!covers || total <= 0) {
    for (const p of participants) fractions[p.personId] = 1
    return { weights, fractions }
  }

  const scaled = [(weights[0] ?? 0) * total]
  participants.forEach((person, i) => {
    const weight = weights[i + 1] ?? 0
    const days = person.from || person.to ? residentDays(covers, person) : total
    const kept = Math.min(total, days)
    fractions[person.personId] = kept / total
    scaled.push(weight * kept)
    scaled[0] = scaled[0]! + weight * (total - kept)
  })
  return { weights: reduce(scaled), fractions }
}

/** Shrinks weights by their common factor; the split is a ratio either way. */
function reduce(weights: number[]): number[] {
  const divisor = weights.reduce(
    (a, b) => gcd(a, Math.abs(Math.trunc(b))),
    0
  )
  return divisor > 1 ? weights.map((w) => w / divisor) : weights
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

export type ComputedLine = {
  line: MonthLine
  amountCents: Cents
  /** False when the amount hasn't been typed in yet (it counts as zero). */
  entered: boolean
  /** Keyed by OWNER and each participant's personId; sums to amountCents. */
  shares: Record<string, Cents>
  /** Per participant, 0–1: how much of this line's service they were here for. */
  occupancy: Record<string, number>
  /** True when someone was here for only part of what this line covers. */
  prorated: boolean
}

export type ComputedMonth = {
  lines: ComputedLine[]
  totalCents: Cents
  totals: Record<string, Cents>
}

export function computeMonth(
  month: Pick<MonthRecord, "lines" | "split" | "participants">
): ComputedMonth {
  const personIds = month.participants.map((p) => p.personId)
  const keys = [OWNER, ...personIds]
  const totals: Record<string, Cents> = Object.fromEntries(
    keys.map((k) => [k, 0])
  )

  const lines = month.lines.map((line): ComputedLine => {
    const raw = lineAmountCents(line)
    const amountCents = raw ?? 0
    const split = line.split.mode === "default" ? month.split : line.split
    const { weights, fractions } = occupancyWeights(
      shareWeights(split, personIds),
      line.covers,
      month.participants
    )
    const parts = allocate(amountCents, weights)
    const shares: Record<string, Cents> = {}
    keys.forEach((key, i) => {
      shares[key] = parts[i] ?? 0
      totals[key] = (totals[key] ?? 0) + shares[key]
    })
    return {
      line,
      amountCents,
      entered: raw !== null,
      shares,
      occupancy: fractions,
      prorated: Object.values(fractions).some((f) => f < 1),
    }
  })

  return {
    lines,
    totalCents: lines.reduce((a, l) => a + l.amountCents, 0),
    totals,
  }
}
