import { type Cents, splitEven } from "./money"
import type { Plan } from "./plans"
import type { PublishedPlan } from "./schema"

/**
 * A schedule re-cut for a new total without rewriting what's been paid.
 *
 * `plan` is the schedule as the current numbers build it; `published` is the same plan as the
 * roommate last saw it. What's been received is poured into the published rows oldest-first, and
 * every row it fully covered keeps its published amount. Whatever is still owed is spread evenly
 * over the rest — so when a bill is corrected after they've started paying, the payments they've
 * made stay made and the difference lands on the ones still to come.
 *
 * A row only stays settled while its date is unchanged (a new schedule re-spreads everything),
 * while it isn't the last row (the last absorbs a change, since there's nothing later to put it
 * on), and while the settled rows still fit inside the new total (a bill that drops below what's
 * been paid gives way, and shows as overpaid).
 */
export function reconcilePlan(plan: Plan, published: PublishedPlan | undefined, receivedCents: Cents): Plan {
  if (!published || receivedCents <= 0) return plan
  const total = plan.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const limit = Math.min(published.payments.length, plan.payments.length - 1)

  const settled: Cents[] = []
  let pool = receivedCents
  let settledCents = 0
  for (let i = 0; i < limit; i++) {
    const row = published.payments[i]!
    if (row.date !== plan.payments[i]!.date) break
    if (row.amountCents <= 0 || row.amountCents > pool) break
    if (settledCents + row.amountCents > total) break
    settled.push(row.amountCents)
    pool -= row.amountCents
    settledCents += row.amountCents
  }
  if (settled.length === 0) return plan

  const rest = splitEven(total - settledCents, plan.payments.length - settled.length)
  return {
    ...plan,
    payments: plan.payments.map((payment, i) => ({
      ...payment,
      amountCents: i < settled.length ? settled[i]! : rest[i - settled.length]!,
    })),
  }
}

/** Every plan reconciled against the published plan with the same key. */
export function reconcilePlans(
  plans: Plan[],
  published: PublishedPlan[] | undefined,
  receivedCents: Cents
): Plan[] {
  return plans.map((plan) => reconcilePlan(plan, published?.find((p) => p.key === plan.key), receivedCents))
}
