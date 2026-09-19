import { type ISODate, diffDays } from "./dates"
import type { Cents } from "./money"
import { paidProgress } from "./paid"
import type { Plan, PlanPayment } from "./plans"

/**
 * Where a payment stands on a given day. Listed in the order a payment moves
 * through them, which is also the order calendar SEQUENCE numbers rely on.
 */
export type PaymentStatus = "future" | "pending" | "pay_now" | "overdue" | "paid"

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  future: "Future",
  pending: "Pending",
  pay_now: "Pay now",
  overdue: "Overdue",
  paid: "Paid",
}

/** A payment turns "pending" this many days before it's due. */
export const PENDING_DAYS = 3

const ORDER: PaymentStatus[] = ["future", "pending", "pay_now", "overdue", "paid"]

export const statusRank = (status: PaymentStatus): number => ORDER.indexOf(status)

export type PaymentWithStatus = PlanPayment & {
  status: PaymentStatus
  /** What's still owed on this payment (less than the amount if part-paid). */
  remainingCents: Cents
}

/**
 * Each payment's status on `today`. What's been received is applied to the
 * payments oldest-first, so paying early or in odd amounts still lines up.
 */
export function paymentStatuses(
  plan: Plan,
  receivedCents: Cents,
  today: ISODate
): PaymentWithStatus[] {
  return paidProgress(plan, receivedCents).rows.map((row) => {
    const payment = { date: row.date, amountCents: row.amountCents, label: row.label }
    const remainingCents = Math.max(0, row.amountCents - row.paidCents)
    if (row.status === "paid") return { ...payment, status: "paid", remainingCents }
    const daysOut = diffDays(today, row.date)
    const status: PaymentStatus =
      daysOut < 0 ? "overdue" : daysOut === 0 ? "pay_now" : daysOut <= PENDING_DAYS ? "pending" : "future"
    return { ...payment, status, remainingCents }
  })
}

/** Today's date where someone is — the roommate's day, not the server's. */
export function todayInTimeZone(timeZone: string | null | undefined, now = new Date()): ISODate {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
  if (timeZone && timeZone.length <= 64) {
    try {
      return format(timeZone)
    } catch {
      // Not a zone this runtime knows; fall through.
    }
  }
  return format("UTC")
}
