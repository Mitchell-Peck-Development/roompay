import { createHash } from "node:crypto"

/** A deterministic, well-formed SHA-256 hex string for test rows. */
export const h = (n: number) =>
  createHash("sha256").update(`test-${n}`).digest("hex")

/** The smallest payload the rp functions will accept. */
export const payload = (plans: string[] = ["full", "weekly"]) => ({
  v: 1,
  kind: "monthly",
  period: "2026-10",
  title: "October 2026",
  currency: "USD",
  lines: [{ label: "Rent", totalCents: 191000, shareCents: 95500 }],
  totalCents: 191000,
  shareCents: 95500,
  plans: plans.map((key) => ({
    key,
    name: key,
    payments: [{ date: "2026-10-01", amountCents: 95500, label: "Full amount" }],
  })),
  defaultPlan: plans[0],
})

/** "YYYY-MM" for the month `offset` months from now (the SQL checks against now). */
export function monthFromNow(offset: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return d.toISOString().slice(0, 7)
}
