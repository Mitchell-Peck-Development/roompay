import type { Cents } from "./money"
import type { Plan, PlanPayment } from "./plans"
import type { PaidEntry } from "./schema"

export type PaidRow = PlanPayment & {
  status: "paid" | "partial" | "due"
  paidCents: Cents
}

export type PaidProgress = {
  rows: PaidRow[]
  paidCents: Cents
  remainingCents: Cents
  overpaidCents: Cents
}

/**
 * Payments are tracked as a running total, not per-row ticks, so the picture
 * stays right when a roommate pays a partial amount or switches plan: the
 * total is poured into the plan's rows in date order.
 */
export function paidProgress(plan: Plan, entries: PaidEntry[]): PaidProgress {
  const paidCents = entries.reduce((a, e) => a + e.amountCents, 0)
  const owed = plan.payments.reduce((a, p) => a + p.amountCents, 0)
  let pool = Math.max(0, paidCents)

  const rows = plan.payments.map((payment): PaidRow => {
    const applied = Math.min(pool, Math.max(0, payment.amountCents))
    pool -= applied
    const status =
      applied >= payment.amountCents ? "paid" : applied > 0 ? "partial" : "due"
    return { ...payment, status, paidCents: applied }
  })

  return {
    rows,
    paidCents,
    remainingCents: Math.max(0, owed - paidCents),
    overpaidCents: Math.max(0, paidCents - owed),
  }
}
