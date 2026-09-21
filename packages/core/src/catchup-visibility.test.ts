import { beforeEach, describe, expect, it } from "vitest"
import { catchupSpan, isCatchingUp, showCatchupTab } from "./catchup"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import type { AppData } from "./schema"

const now = new Date(2026, 8, 19)

/**
 * The default items are the shape that matters here: rent and fees cover the
 * month they're billed in, water, sewer and power cover the month before. So
 * a September move-in is still being caught up on in November, when the last
 * of those arrears bills lands.
 */
describe("when the Catch-up tab has something to say", () => {
  let data: AppData
  let biscuit: string

  beforeEach(() => {
    data = createInitialData(now)
    biscuit = M.addPerson(data, "Biscuit")
  })

  it("stays quiet for a household where nobody has moved in", () => {
    expect(isCatchingUp(data, "2026-09")).toBe(false)
    expect(isCatchingUp(data, "2026-10")).toBe(false)
  })

  it("follows residency set in Setup, before a catch-up is opened", () => {
    M.setPersonResidency(data, biscuit, { from: "2026-09-14" })
    expect(data.catchups[biscuit]).toBeUndefined()
    // The month before, so it can be set up ahead of the move.
    expect(isCatchingUp(data, "2026-08")).toBe(true)
    expect(isCatchingUp(data, "2026-07")).toBe(false)
    expect(isCatchingUp(data, "2026-09")).toBe(true)
    expect(isCatchingUp(data, "2026-10")).toBe(true)
    // November's statement carries October's water — the last month theirs.
    expect(isCatchingUp(data, "2026-11")).toBe(true)
    expect(isCatchingUp(data, "2026-12")).toBe(false)
  })

  it("stops a month earlier when the next full month isn't included", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.patchCatchup(data, biscuit, { includeNextMonth: false }, now)
    expect(isCatchingUp(data, "2026-10")).toBe(true)
    expect(isCatchingUp(data, "2026-11")).toBe(false)
  })

  it("keeps going while the installments do", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    expect(catchupSpan(data.catchups[biscuit]!, data.items).to).toBe("2026-11")
    M.patchCatchup(data, biscuit, { end: "2027-02-01", installments: 6 }, now)
    expect(isCatchingUp(data, "2027-02")).toBe(true)
    expect(isCatchingUp(data, "2027-03")).toBe(false)
  })

  it("lets a settled catch-up finish its months, then drops away", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.patchCatchup(data, biscuit, { end: "2027-02-01" }, now)
    M.closeCatchup(data, biscuit, now)
    // Settling it doesn't yank the tab out from under whoever just settled it,
    // but it no longer holds the tab open for a plan that's been paid off.
    expect(isCatchingUp(data, "2026-09")).toBe(true)
    expect(isCatchingUp(data, "2026-11")).toBe(true)
    expect(isCatchingUp(data, "2026-12")).toBe(false)
  })

  it("ignores a roommate who has been archived", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.setPersonArchived(data, biscuit, true)
    expect(isCatchingUp(data, "2026-09")).toBe(false)
  })
})

describe("the Catch-up tab override in Setup", () => {
  let data: AppData

  beforeEach(() => {
    data = createInitialData(now)
    const biscuit = M.addPerson(data, "Biscuit")
    M.ensureCatchup(data, biscuit, "2026-09-14")
  })

  it("is automatic to begin with", () => {
    expect(data.prefs.catchupTab).toBe("auto")
    expect(showCatchupTab(data, "2026-09")).toBe(true)
    expect(showCatchupTab(data, "2027-06")).toBe(false)
  })

  it("hides it even mid-catch-up when it's forced off", () => {
    data.prefs.catchupTab = "off"
    expect(showCatchupTab(data, "2026-09")).toBe(false)
  })

  it("keeps it around long after the catch-up when it's forced on", () => {
    data.prefs.catchupTab = "on"
    expect(showCatchupTab(data, "2027-06")).toBe(true)
  })
})
