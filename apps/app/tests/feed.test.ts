import { type SharePayload, buildPlans, defaultCadences } from "@workspace/core"
import { describe, expect, it } from "vitest"
import { buildFeed, buildOneOff, pageUrl } from "@/lib/server/rp/feed"
import type { LinkView, StatementView } from "@/lib/server/rp/service"

const SECRET_TOKEN = "secret-token-0000000000"

function statement(period: string, overrides: Partial<StatementView> = {}): StatementView {
  const payload: SharePayload = {
    v: 1,
    kind: "monthly",
    period,
    title: period,
    currency: "USD",
    lines: [],
    totalCents: 191000,
    shareCents: 95500,
    plans: buildPlans(95500, defaultCadences(), period),
    defaultPlan: "full",
  }
  return {
    period,
    kind: "monthly",
    payload,
    chosenPlan: null,
    chosenAt: null,
    revision: 1,
    publishedAt: "2026-09-28T12:00:00+00:00",
    updatedAt: "2026-09-28T12:00:00+00:00",
    ...overrides,
  }
}

const view: LinkView = {
  link: {
    id: "11111111-2222-3333-4444-555555555555",
    householdLabel: "Unit 3012",
    roommateLabel: "Biscuit",
    preferredPlan: "weekly",
    expiresAt: "2027-01-01T00:00:00+00:00",
  },
  statements: [
    statement("2026-11", { revision: 1 }), // no pick → inherits the link's "weekly"
    statement("2026-10", { chosenPlan: "half", revision: 7 }),
    statement("2026-07"), // long past → dropped from the feed
  ],
}

const options = { origin: "https://app.example", token: SECRET_TOKEN, today: "2026-10-05" }

describe("buildFeed", () => {
  const ics = buildFeed(view, options)

  it("renders each month with the right plan", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2 + 4)
    expect(ics).toContain("UID:11111111-2222-3333-4444-555555555555-2026-10-monthly-half-1@roompay")
    expect(ics).toContain("UID:11111111-2222-3333-4444-555555555555-2026-11-monthly-weekly-4@roompay")
    expect(ics).not.toContain("2026-07")
  })

  it("uses each statement's revision as the event sequence", () => {
    const sequences = [...ics.matchAll(/SEQUENCE:(\d+)/g)].map((m) => m[1])
    expect(sequences).toEqual(["7", "7", "1", "1", "1", "1"])
  })

  it("names the calendar, asks for hourly refresh, and never leaks the token in ids", () => {
    expect(ics).toContain("X-WR-CALNAME:RoomPay · Unit 3012")
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H")
    for (const uid of ics.matchAll(/UID:(.*)/g)) expect(uid[1]).not.toContain(SECRET_TOKEN)
  })

  it("falls back to the owner's default when nothing was ever picked", () => {
    const fresh = buildFeed(
      { ...view, link: { ...view.link, preferredPlan: null }, statements: [statement("2026-11")] },
      options
    )
    expect(fresh.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it("gives an unknown link a valid empty calendar", () => {
    const empty = buildFeed(null, options)
    expect(empty).toContain("X-WR-CALNAME:RoomPay")
    expect(empty).not.toContain("BEGIN:VEVENT")
  })
})

describe("buildOneOff", () => {
  it("renders the requested plan without subscription hints", () => {
    const ics = buildOneOff(view, { ...options, period: "2026-10", kind: "monthly", plan: "weekly" })!
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4)
    expect(ics).not.toContain("REFRESH-INTERVAL")
  })

  it("defaults to the roommate's pick, and is null for unknown months", () => {
    const ics = buildOneOff(view, { ...options, period: "2026-10", kind: "monthly" })!
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(buildOneOff(view, { ...options, period: "2026-12", kind: "monthly" })).toBeNull()
    expect(buildOneOff(view, { ...options, period: "2026-10", kind: "catchup" })).toBeNull()
  })
})

describe("pageUrl", () => {
  it("points at the statement", () => {
    expect(pageUrl("https://x", "t")).toBe("https://x/r/t")
    expect(pageUrl("https://x", "t", statement("2026-10"))).toBe("https://x/r/t/2026-10")
    expect(pageUrl("https://x", "t", statement("2026-09", { kind: "catchup" }))).toBe(
      "https://x/r/t/2026-09?kind=catchup"
    )
  })
})
