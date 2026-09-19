import { describe, expect, it } from "vitest"
import { backupFilename, makeBackup, mergeData, parseBackup } from "./backup"
import { createInitialData, newMonth } from "./defaults"

const now = new Date(2026, 8, 18)

describe("backup", () => {
  it("round-trips", () => {
    const data = createInitialData(now)
    const parsed = parseBackup(JSON.stringify(makeBackup(data, now)))
    expect(parsed).toEqual({ ok: true, data })
    expect(backupFilename(now)).toBe("roompay-backup-2026-09-18.json")
  })

  it("rejects anything else", () => {
    expect(parseBackup("not json").ok).toBe(false)
    expect(parseBackup("{}").ok).toBe(false)
    expect(
      parseBackup(
        JSON.stringify({ format: "roompay-backup", version: 1, exportedAt: "x", data: { version: 1 } })
      ).ok
    ).toBe(false)
    expect(
      parseBackup(JSON.stringify({ format: "roompay-backup", version: 99, exportedAt: "x", data: createInitialData(now) }))
    ).toMatchObject({ ok: false })
  })

  it("merges by id, newest wins", () => {
    const local = createInitialData(now)
    local.people.push({ id: "a", nickname: "Biscuit" })
    const incoming = structuredClone(local)
    incoming.people[0]!.nickname = "ignored"
    incoming.people.push({ id: "b", nickname: "3012-B" })

    const m1 = newMonth(local, "2026-08", now)
    local.months.push({ ...m1, title: "old", updatedAt: "2026-08-01T00:00:00.000Z" })
    incoming.months.push({ ...m1, title: "new", updatedAt: "2026-08-02T00:00:00.000Z" })
    incoming.months.push(newMonth(incoming, "2026-07", now))

    local.links.a = { token: "t-old-0000000000000", writeKey: "k000000000000000", createdAt: "2026-01-01T00:00:00.000Z" }
    incoming.links.a = { token: "t-new-0000000000000", writeKey: "k000000000000000", createdAt: "2026-02-01T00:00:00.000Z" }

    local.household.label = "Local"
    local.meta.updatedAt = "2026-09-18T10:00:00.000Z"
    incoming.household.label = "Incoming"
    incoming.meta.updatedAt = "2026-09-17T10:00:00.000Z"

    const merged = mergeData(local, incoming)
    expect(merged.people.map((p) => [p.id, p.nickname])).toEqual([["a", "Biscuit"], ["b", "3012-B"]])
    expect(merged.months.find((m) => m.id === m1.id)!.title).toBe("new")
    expect(merged.months.map((m) => m.period)).toEqual(["2026-08", "2026-07"])
    expect(merged.links.a!.token).toBe("t-new-0000000000000")
    expect(merged.household.label).toBe("Local")
    expect(merged.current.id).toBe(local.current.id)
    expect(merged.meta.updatedAt).toBe("2026-09-18T10:00:00.000Z")
  })

  it("takes the incoming household and working month when they are newer", () => {
    const local = createInitialData(now)
    const incoming = structuredClone(local)
    incoming.household.label = "Incoming"
    incoming.current.title = "theirs"
    incoming.meta.updatedAt = "2099-01-01T00:00:00.000Z"
    const merged = mergeData(local, incoming)
    expect(merged.household.label).toBe("Incoming")
    expect(merged.current.title).toBe("theirs")
  })
})
