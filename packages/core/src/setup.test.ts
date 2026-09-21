import { beforeEach, describe, expect, it } from "vitest"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import type { AppData } from "./schema"
import { CONFIRMED_STEPS, isSetupReady, setupProgress, setupSteps } from "./setup"

const now = new Date(2026, 8, 19)

const step = (data: AppData, id: string) =>
  setupSteps(data).find((s) => s.id === id)!

/** A household with the first run answered: a name, a roommate, a rent. */
function started(): AppData {
  const data = createInitialData(now)
  data.household.label = "Unit 3012"
  M.addPerson(data, "Biscuit")
  for (const item of data.items) {
    if (item.kind === "fixed") M.setItemDefaultAmount(data, item.id, 1000)
  }
  return data
}

describe("the setup checklist", () => {
  let data: AppData

  beforeEach(() => {
    data = createInitialData(now)
  })

  it("starts with everything to do", () => {
    const progress = setupProgress(data)
    expect(progress.done).toBe(0)
    expect(progress.total).toBe(6)
    expect(progress.next?.id).toBe("place")
    expect(progress.ready).toBe(false)
    expect(isSetupReady(data)).toBe(false)
  })

  it("reads what it can straight off the data", () => {
    expect(step(data, "place").done).toBe(false)
    data.household.label = "Unit 3012"
    expect(step(data, "place").done).toBe(true)

    expect(step(data, "people").done).toBe(false)
    const biscuit = M.addPerson(data, "Biscuit")
    expect(step(data, "people").done).toBe(true)
    // Someone who has moved out doesn't count as a roommate to split with.
    M.setPersonArchived(data, biscuit, true)
    expect(step(data, "people").done).toBe(false)
  })

  it("wants an amount for every fixed item, or the item switched off", () => {
    expect(step(data, "items").done).toBe(false)
    const fixed = data.items.filter((item) => item.kind === "fixed")
    for (const item of fixed.slice(1)) M.setItemDefaultAmount(data, item.id, 2000)
    expect(step(data, "items").done).toBe(false)
    // The one left over is a charge this place doesn't have.
    M.upsertItem(data, { ...fixed[0]!, enabled: false })
    expect(step(data, "items").done).toBe(true)
    // Items billed from the statement have no amount to give up front.
    expect(data.items.some((item) => item.enabled && item.kind === "variable")).toBe(true)
  })

  it("knows which steps only the owner can answer", () => {
    const confirms = setupSteps(data).filter((s) => s.confirms).map((s) => s.id)
    expect(confirms).toEqual([...CONFIRMED_STEPS])
  })

  it("takes the owner's word for the steps data can't answer", () => {
    expect(step(data, "timing").done).toBe(false)
    M.setSetupReviewed(data, "timing", true)
    expect(step(data, "timing").done).toBe(true)
    expect(data.prefs.reviewed).toEqual(["timing"])
    // Ticking twice doesn't duplicate it, and it can be put back.
    M.setSetupReviewed(data, "timing", true)
    expect(data.prefs.reviewed).toEqual(["timing"])
    M.setSetupReviewed(data, "timing", false)
    expect(step(data, "timing").done).toBe(false)
  })

  it("counts a split someone actually chose as checked", () => {
    expect(step(data, "split").done).toBe(false)
    data.split = { mode: "percent", pct: { a: 50 } }
    expect(step(data, "split").done).toBe(true)
  })

  it("is ready once the required steps are done, and says what's next", () => {
    data = started()
    let progress = setupProgress(data)
    expect(progress.done).toBe(3)
    expect(progress.next?.id).toBe("timing")
    expect(progress.ready).toBe(false)

    for (const id of ["timing", "split", "cadences"] as const) {
      M.setSetupReviewed(data, id, true)
    }
    progress = setupProgress(data)
    expect(progress.ready).toBe(true)
    expect(isSetupReady(data)).toBe(true)
    // Ready isn't finished: there's still a month to bill and a link to send.
    expect(progress.complete).toBe(false)
    expect(progress.next?.id).toBe("month")
  })

  it("follows the months, the link and the backup to the end", () => {
    data = started()
    for (const id of ["timing", "split", "cadences"] as const) {
      M.setSetupReviewed(data, id, true)
    }
    const rent = data.current.lines.find((l) => l.label === "Rent")!
    M.setLineAmount(data, rent.id, 164800, now)
    expect(step(data, "month").done).toBe(true)

    expect(step(data, "share").done).toBe(false)
    M.setPublished(data, { kind: "monthly", monthId: data.current.id }, data.people[0]!.id, {
      at: now.toISOString(),
      hash: "abc",
    })
    expect(step(data, "share").done).toBe(true)

    expect(step(data, "backup").done).toBe(false)
    data.meta.lastBackupAt = now.toISOString()
    expect(setupProgress(data).complete).toBe(true)
    expect(setupProgress(data).next).toBeNull()
  })
})
