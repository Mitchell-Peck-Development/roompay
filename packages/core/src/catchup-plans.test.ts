import { describe, expect, it } from "vitest"
import { CATCHUP_PLAN_KEY, catchupPlans, computeCatchup } from "./catchup"
import { defaultCadences } from "./defaults"
import type { Plan } from "./plans"
import type { Cadence, CatchupRecord, ItemTemplate } from "./schema"

const record: CatchupRecord = {
  personId: "a",
  moveIn: "2026-09-14",
  estimates: {},
  includeNextMonth: true,
  installments: 4,
  start: "2026-09-14",
  end: "2026-10-01",
  paid: [],
}
const items: ItemTemplate[] = [
  { id: "rent", label: "Rent", kind: "fixed", enabled: true, defaultAmountCents: 191000, split: { mode: "default" } },
]
const catchup = (r: CatchupRecord) =>
  computeCatchup({ record: r, items, split: { mode: "even" }, people: [{ id: "a", nickname: "A" }] })
const cadence = (key: string, days: number[]): Cadence => ({ id: key, key, name: key, days })
const plansFor = (r: CatchupRecord, cadences: Cadence[]) => catchupPlans({ result: catchup(r), record: r, cadences })
const datesOf = (plans: Plan[]) => Object.fromEntries(plans.map((p) => [p.key, p.payments.map((x) => x.date)]))

describe("catchupPlans", () => {
  it("offers the owner's installments first, then the household's usual schedules", () => {
    const plans = plansFor(record, defaultCadences())
    expect(plans.map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "full", "half", "weekly"])
    expect(plans[0]!.payments).toEqual(catchup(record).plan.payments)
    expect(datesOf(plans.slice(1))).toEqual({
      full: ["2026-10-01"],
      half: ["2026-09-15", "2026-10-01"],
      weekly: ["2026-09-15", "2026-09-22", "2026-10-01"],
    })
  })

  it("spreads the whole catch-up evenly over each schedule's dates", () => {
    const plans = plansFor(record, defaultCadences())
    for (const plan of plans) {
      expect(plan.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(149617)
    }
    expect(plans.find((p) => p.key === "half")!.payments.map((p) => p.amountCents)).toEqual([74809, 74808])
  })

  it("clamps a day past the end of a short month, like monthly dates do", () => {
    const r = { ...record, moveIn: "2026-02-10", start: "2026-02-10", end: "2026-03-31" }
    expect(datesOf(plansFor(r, [cadence("end", [31])]))).toMatchObject({ end: ["2026-02-28", "2026-03-31"] })
  })

  it("leaves out a schedule with no day before the catch-up is due", () => {
    const r = { ...record, end: "2026-09-30" }
    expect(plansFor(r, defaultCadences()).map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "half", "weekly"])
  })

  it("offers two schedules that land on the same dates only once", () => {
    const plans = plansFor(record, [cadence("first", [1]), cadence("first-or-second", [1, 2])])
    expect(plans.map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "first"])
  })

  it("never offers more schedules than a share link holds", () => {
    const many = Array.from({ length: 12 }, (_, i) => cadence(`c${i}`, [14 + i]))
    const plans = plansFor(record, many)
    expect(plans).toHaveLength(12)
    expect(plans[0]!.key).toBe(CATCHUP_PLAN_KEY)
  })

  it("describes the owner's schedule by its dates, and the household's by their days", () => {
    const plans = plansFor(record, defaultCadences())
    expect(plans[0]!.description).toBe("Evenly spaced from Sep 14 to Oct 1.")
    expect(plans.find((p) => p.key === "half")!.description).toBe("On the 1st and 15th, like every month.")
  })
})
