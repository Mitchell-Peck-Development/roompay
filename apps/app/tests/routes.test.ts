import {
  buildMonthlyPayload,
  createInitialData,
  newMonth,
  randomToken,
} from "@workspace/core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { resetBackendForTests } from "@/lib/server/rp/backend"

process.env.RP_BACKEND = "pglite"
process.env.RP_PGLITE_DIR = "memory://"
delete process.env.NEXT_PUBLIC_APP_URL

const routes = {
  publish: () => import("@/app/api/share/publish/route"),
  unpublish: () => import("@/app/api/share/unpublish/route"),
  revoke: () => import("@/app/api/share/revoke/route"),
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

function octoberPayload() {
  const now = new Date(2026, 8, 18)
  const data = createInitialData(now)
  data.people.push({ id: "a", nickname: "Biscuit" })
  const month = newMonth(data, "2026-10", now)
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
    expect(new Date(first.body.expiresAt).toISOString().slice(0, 10)).toBe("2026-12-21")

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
      statements: [{ period: "2026-10", kind: "monthly", chosenPlan: null, revision: 2 }],
    })
    expect(JSON.stringify(body)).not.toContain(writeKey)

    const tooMany = Array.from({ length: 13 }, () => randomToken())
    expect((await post("status", { tokens: tooMany })).status).toBe(400)
  })

  it("records the roommate's pick", async () => {
    const pick = { token, period: "2026-10", kind: "monthly" }
    expect(await post("pick", { ...pick, plan: "weekly" })).toEqual({
      status: 200,
      body: { ok: true, chosenPlan: "weekly", revision: 3 },
    })
    expect((await post("pick", { ...pick, plan: "nope" })).status).toBe(400)
    expect((await post("pick", { ...pick, token: randomToken(), plan: "weekly" })).status).toBe(404)

    const { body } = await post("status", { tokens: [token] })
    expect(body.links[token]).toMatchObject({ preferredPlan: "weekly", statements: [{ chosenPlan: "weekly" }] })
  })

  it("serves the feed and one-off calendars", async () => {
    const feed = await calendar(token)
    expect(feed.status).toBe(200)
    expect(feed.headers.get("content-type")).toBe("text/calendar; charset=utf-8")
    expect(feed.headers.get("content-disposition")).toMatch(/^inline/)
    expect(feed.headers.get("cache-control")).toBe("no-store")
    const text = await feed.text()
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(4)
    expect(text).toContain("SUMMARY:Pay $238.75 · Unit 3012")
    expect(text).toContain("X-WR-CALNAME:RoomPay · Unit 3012")
    expect(text).toContain("http://test.local/r/" + token + "/2026-10")
    expect(text).not.toContain(writeKey)

    const oneOff = await calendar(token, "?period=2026-10&plan=half")
    expect((await oneOff.text()).match(/BEGIN:VEVENT/g)).toHaveLength(2)

    expect((await calendar(token, "?period=2026-11")).status).toBe(404)
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
    const month = { token, period: "2026-10", kind: "monthly" }
    expect((await post("unpublish", { ...month, writeKey: randomToken() })).status).toBe(403)
    expect((await post("revoke", { token, writeKey: randomToken() })).status).toBe(403)

    expect(await post("unpublish", { ...month, writeKey })).toEqual({ status: 200, body: { ok: true, deleted: true } })
    expect((await post("status", { tokens: [token] })).body.links[token]).toMatchObject({ ok: true, statements: [] })

    expect((await post("revoke", { token, writeKey })).status).toBe(200)
    expect((await post("status", { tokens: [token] })).body.links[token]).toEqual({ ok: false })
    expect((await post("revoke", { token, writeKey })).status).toBe(404)
  })
})
