import { lineAmountCents } from "./meter"
import { type Cents, allocate } from "./money"
import type { ItemSplit, MonthLine, MonthRecord, Split } from "./schema"

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

export type ComputedLine = {
  line: MonthLine
  amountCents: Cents
  /** False when the amount hasn't been typed in yet (it counts as zero). */
  entered: boolean
  /** Keyed by OWNER and each participant's personId; sums to amountCents. */
  shares: Record<string, Cents>
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
    const parts = allocate(amountCents, shareWeights(split, personIds))
    const shares: Record<string, Cents> = {}
    keys.forEach((key, i) => {
      shares[key] = parts[i] ?? 0
      totals[key] = (totals[key] ?? 0) + shares[key]
    })
    return { line, amountCents, entered: raw !== null, shares }
  })

  return {
    lines,
    totalCents: lines.reduce((a, l) => a + l.amountCents, 0),
    totals,
  }
}
