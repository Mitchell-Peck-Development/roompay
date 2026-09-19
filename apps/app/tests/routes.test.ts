import {
  addDays,
  buildMonthlyPayload,
  createInitialData,
  lastDueOn,
  newMonth,
  randomToken,
} from "@workspace/core"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { resetBackendForTests } from "@/lib/server/rp/backend"
import { monthFromNow } from "./helpers"

process.env.RP_BACKEND = "pglite"
process.env.RP_PGLITE_DIR = "memory://"
delete process.env.APP_URL

const routes = {
  publish: () => import("@/app/api/share/publish/route"),
  unpublish: () => import("@/app/api/share/unpublish/route"),
  revoke: () => import("@/app/api/share/revoke/route"),
  received: () => import("@/app/api/share/received/route"),
  status: () => import("@/app/api/share/status/route"),
  pick: () => import("@/app/api/share/pick/route"),
}

async function post(name: keyof typeof routes, body: unknown) {
  const { POST } = await routes[name]()
  const response = await POST(
    new Request(`http://test.local/api/share/${name}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )
  return { status: response.status, body: await response.json() }
}

async function calendar(token: string, query = "") {
  const { GET } = await import("@/app/r/[token]/calendar.ics/route")
  return GET(new Request(`http://test.local/r/${token}/calendar.ics${query}`), {
    params: Promise.resolve({ token }),
  })
}

// The database only accepts months near today.
const PERIOD = monthFromNow(1)

function octoberPayload() {
  const now = new Date()
  const data = createInitialData(now)
  data.people.push({ id: "a", nickname: "Biscuit" })
  const month = newMonth(data, PERIOD, now)
  const amounts = [164800, 600, 2000, 3800, 3800, 16000]
  month.lines.forEach((line, i) => (line.amountCents = amounts[i]!))
  return buildMonthlyPayload({
    month,
    personId: "a",
    cadences: data.cadences,
    currency: "USD",
  })
}

const token = randomToken()
const writeKey = randomToken()
const base = { token, writeKey, householdLabel: "Unit 3012", roommateLabel: "Biscuit" }

beforeAll(() => resetBackendForTests())
afterAll(() => resetBackendForTests())

describe("share API", () => {
  it("publishes, then revises", async () => {
    const payload = octoberPayload()
    expect(payload.shareCents).toBe(95500)

    const first = await post("publish", { ...base, payload })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ ok: true, revision: 1 })
    expect(new Date(first.body.expiresAt).toISOString().slice(0, 10)).toBe(addDays(lastDueOn(payload), 60))

    const second = await post("publish", { ...base, payload })
    expect(second.body).toMatchObject({ ok: true, revision: 2 })
  })

  it("refuses another device's write key", async () => {
    const result = await post("publish", { ...base, writeKey: randomToken(), payload: octoberPayload() })
    expect(result).toEqual({ status: 403, body: { ok: false, error: "forbidden" } })
  })

  it("rejects malformed input before it reaches the database", async () => {
    const payload = octoberPayload()
    for (const body of [
      "not json",
      {},
      { ...base, token: "short", payload },
      { ...base, payload: { ...payload, plans: [] } },
      { ...base, payload: { ...payload, note: undefined, shareCents: "lots" } },
      { ...base, householdLabel: "x".repeat(81), payload },
    ]) {
      expect(await post("publish", body)).toEqual({ status: 400, body: { ok: false, error: "invalid" } })
    }
  })

  it("reports status per token", async () => {
    const unknown = randomToken()
    const { status, body } = await post("status", { tokens: [token, unknown] })
    expect(status).toBe(200)
    expect(body.links[unknown]).toEqual({ ok: false })
    expect(body.links[token]).toMatchObject({
      ok: true,
      preferredPlan: null,
      statements: [{ period: PERIOD, kind: "monthly", chosenPlan: null, revision: 2 }],
    })
    expect(JSON.stringify(body)).not.toContain(writeKey)

    const tooMany = Array.from({ length: 13 }, () => randomToken())
    expect((await post("status", { tokens: tooMany })).status).toBe(400)
  })

  it("records the roommate's pick", async () => {
    const pick = { token, period: PERIOD, kind: "monthly" }
    expect(await post("pick", { ...pick, plan: "weekly" })).toEqual({
      status: 200,
      body: { ok: true, chosenPlan: "weekly", revision: 3 },
    })
    expect((await post("pick", { ...pick, plan: "nope" })).status).toBe(400)
    expect((await post("pick", { ...pick, token: randomToken(), plan: "weekly" })).status).toBe(404)

    const { body } = await post("status", { tokens: [token] })
    expect(body.links[token]).toMatchObject({ preferredPlan: "weekly", statements: [{ chosenPlan: "weekly" }] })
  })

  it("takes the owner's received total, with the write key only", async () => {
    const statement = { token, period: PERIOD, kind: "monthly" }
    expect((await post("received", { ...statement, writeKey: randomToken(), receivedCents: 23875 })).status).toBe(403)
    expect((await post("received", { ...statement, writeKey, receivedCents: -5 })).status).toBe(400)
    expect(await post("received", { ...statement, writeKey, receivedCents: 23875 })).toEqual({
      status: 200,
      body: { ok: true, receivedCents: 23875, revision: 4 },
    })
    const { body } = await post("status", { tokens: [token] })
    expect(body.links[token].statements[0]).toMatchObject({ receivedCents: 23875, revision: 4 })
  })

  it("serves the feed and one-off calendars", async () => {
    const feed = await calendar(token)
    expect(feed.status).toBe(200)
    expect(feed.headers.get("content-type")).toBe("text/calendar; charset=utf-8")
    expect(feed.headers.get("content-disposition")).toMatch(/^inline/)
    expect(feed.headers.get("cache-control")).toBe("no-store")
    const text = await feed.text()
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(4)
    // Next month: the first weekly payment is covered, the rest are still to come.
    expect(text).toContain("SUMMARY:Paid · $238.75 · Unit 3012")
    expect(text).toMatch(/SUMMARY:(Future|Pending) · Pay \$238\.75 · Unit 3012/)
    expect(text).toContain("REFRESH-INTERVAL;VALUE=DURATION:P1D")
    expect(text).toContain("X-WR-CALNAME:RoomPay · Unit 3012")
    expect(text).toContain(`http://test.local/r/${token}/${PERIOD}`)
    expect(text).not.toContain(writeKey)

    // "Today" comes from the roommate's time zone when the subscribe link carries one.
    const zoned = await (await calendar(token, "?tz=Pacific/Kiritimati")).text()
    expect(zoned).toContain("BEGIN:VCALENDAR")
    expect((await calendar(token, "?tz=Not/AZone")).status).toBe(200)

    const oneOff = await calendar(token, `?period=${PERIOD}&plan=half`)
    expect((await oneOff.text()).match(/BEGIN:VEVENT/g)).toHaveLength(2)

    expect((await calendar(token, `?period=${monthFromNow(2)}`)).status).toBe(404)
    expect((await calendar(token, "?period=garbage")).status).toBe(404)
  })

  it("an unknown token still gets a valid, empty feed", async () => {
    const response = await calendar(randomToken())
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain("BEGIN:VCALENDAR")
    expect(text).not.toContain("BEGIN:VEVENT")
  })

  it("unpublishes and revokes with the write key only", async () => {
    const month = { token, period: PERIOD, kind: "monthly" }
    expect((await post("unpublish", { ...month, writeKey: randomToken() })).status).toBe(403)
    expect((await post("revoke", { token, writeKey: randomToken() })).status).toBe(403)

    expect(await post("unpublish", { ...month, writeKey })).toEqual({ status: 200, body: { ok: true, deleted: true } })
    expect((await post("status", { tokens: [token] })).body.links[token]).toMatchObject({ ok: true, statements: [] })

    expect((await post("revoke", { token, writeKey })).status).toBe(200)
    expect((await post("status", { tokens: [token] })).body.links[token]).toEqual({ ok: false })
    expect((await post("revoke", { token, writeKey })).status).toBe(404)
  })
})

describe("when the database is unavailable", () => {
  it("the feed answers 503 instead of an empty calendar", async () => {
    const service = await import("@/lib/server/rp/service")
    const spy = vi.spyOn(service, "viewLink").mockRejectedValueOnce(new Error("connection refused"))
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await calendar(randomToken())
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("600")
    spy.mockRestore()
    errors.mockRestore()
  })
})

describe("when sharing isn't configured", () => {
  it("names the variables that are unset, so a 503 is diagnosable", async () => {
    // What a production deploy looks like with the wrong variable names: the
    // Supabase Vercel integration sets SUPABASE_ANON_KEY, which isn't read.
    const env = { ...process.env }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    await resetBackendForTests()
    delete process.env.RP_BACKEND
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    process.env.SUPABASE_URL = "https://example.supabase.co"
    vi.stubEnv("NODE_ENV", "production")

    const response = await post("status", { tokens: [randomToken()] })
    expect(response).toEqual({
      status: 503,
      body: {
        ok: false,
        error: "sharing_unconfigured",
        missing: ["SUPABASE_PUBLISHABLE_KEY"],
      },
    })
    expect(errors.mock.calls[0]?.[1]).toMatch(/SUPABASE_PUBLISHABLE_KEY is unset/)

    vi.unstubAllEnvs()
    process.env = env
    errors.mockRestore()
    await resetBackendForTests()
  })
})
