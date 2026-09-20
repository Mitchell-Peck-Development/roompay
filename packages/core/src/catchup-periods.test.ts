import { beforeEach, describe, expect, it } from "vitest"
import { catchupPeriods, computeCatchup, coveredByCatchup } from "./catchup"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import type { AppData } from "./schema"

const now = new Date(2026, 8, 19)

describe("the months a catch-up settles", () => {
  let data: AppData
  let biscuit: string

  beforeEach(() => {
    data = createInitialData(now)
    biscuit = M.addPerson(data, "Biscuit")
    M.setLineAmount(data, data.current.lines.find((l) => l.label === "Rent")!.id, 164800, now)
    M.ensureCatchup(data, biscuit, "2026-09-14")
  })

  it("is their part-month, and the next one when it's included", () => {
    expect(catchupPeriods(data.catchups[biscuit]!)).toEqual(["2026-09", "2026-10"])
    M.patchCatchup(data, biscuit, { includeNextMonth: false }, now)
    expect(catchupPeriods(data.catchups[biscuit]!)).toEqual(["2026-09"])
  })

  it("says which months are already spoken for, and for whom", () => {
    expect(coveredByCatchup(data, biscuit, "2026-09")).toBe(true)
    expect(coveredByCatchup(data, biscuit, "2026-10")).toBe(true)
    expect(coveredByCatchup(data, biscuit, "2026-11")).toBe(false)
    // Only the roommate who's catching up.
    const other = M.addPerson(data, "Someone else")
    expect(coveredByCatchup(data, other, "2026-09")).toBe(false)
  })

  it("stops covering a month once the catch-up is put away", () => {
    M.closeCatchup(data, biscuit)
    expect(coveredByCatchup(data, biscuit, "2026-09")).toBe(false)
    expect(data.catchups[biscuit]!.closedAt).toBeTruthy()
  })
})

describe("a catch-up as the real bills arrive", () => {
  let data: AppData
  let biscuit: string
  const result = () =>
    computeCatchup({
      record: data.catchups[biscuit]!,
      items: data.items,
      split: data.split,
      people: data.people,
      months: data.months,
    })

  beforeEach(() => {
    data = createInitialData(now)
    biscuit = M.addPerson(data, "Biscuit")
    M.setPersonResidency(data, biscuit, { from: "2026-09-14" })
    const rent = data.current.lines.find((l) => l.label === "Rent")!
    M.setLineAmount(data, rent.id, 164800, now)
    M.ensureCatchup(data, biscuit, "2026-09-14")
  })

  it("estimates while there's nothing saved for those months", () => {
    const { statements } = result()
    expect(statements.map((s) => [s.period, s.estimated])).toEqual([
      ["2026-09", true],
      ["2026-10", true],
    ])
  })

  it("uses the real numbers for a month once it's saved", () => {
    // September's bill turns out higher than the estimate.
    M.setLineAmount(data, data.current.lines.find((l) => l.label === "Power")!.id, 21000, now)
    M.saveCurrent(data, now)

    const { statements, combinedCents } = result()
    expect(statements[0]).toMatchObject({ period: "2026-09", estimated: false })
    expect(statements[1]).toMatchObject({ period: "2026-10", estimated: true })

    // September's share now matches what the Month tab says it is.
    const september = data.months.find((m) => m.period === "2026-09")!
    const share = M.monthShare(september, biscuit)
    expect(statements[0]!.shareCents).toBe(share)
    expect(combinedCents).toBe(share + statements[1]!.shareCents)
  })

  it("keeps the plan's payments adding up to what's owed", () => {
    M.saveCurrent(data, now)
    const { plan, combinedCents } = result()
    expect(plan.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(combinedCents)
  })
})
