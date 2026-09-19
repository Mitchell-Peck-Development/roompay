import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createPgliteBackend } from "@/lib/server/rp/pglite"
import { h, monthFromNow, payload } from "./helpers"

// These run the real migration in supabase/migrations against an in-process
// Postgres, so the SQL the owner applies is the SQL under test.

let rp: Awaited<ReturnType<typeof createPgliteBackend>>

type ViewResult = {
  link: {
    id: string
    household_label: string
    roommate_label: string
    preferred_plan: string | null
    expires_at: string
  }
  statements: {
    period: string
    kind: string
    payload: { plans: unknown[] }
    chosen_plan: string | null
    chosen_at: string | null
    received_cents: number
    revision: number
  }[]
}

// Periods are checked against today, so the fixtures are relative to it.
const THIS = monthFromNow(0)
const NEXT = monthFromNow(1)

const pub = (overrides: Record<string, unknown> = {}) =>
  rp.call<{ revision: number; expires_at: string }>("publish", {
    p_token_hash: h(1),
    p_write_key_hash: h(2),
    p_household_label: "Unit 3012",
    p_roommate_label: "Biscuit",
    p_period: THIS,
    p_kind: "monthly",
    p_payload: payload(),
    p_last_due_on: `${THIS}-22`,
    ...overrides,
  })

const count = async (table: string) => {
  const { rows } = await rp.db.query<{ n: number }>(
    `select count(*)::int as n from rp.${table}`
  )
  return rows[0]!.n
}

beforeAll(async () => {
  rp = await createPgliteBackend({ dataDir: "memory://" })
})
afterAll(() => rp.close())
beforeEach(() => rp.db.exec("truncate rp.links cascade"))

describe("rp.publish", () => {
  it("creates the link, then bumps the revision", async () => {
    expect(await pub()).toMatchObject({ ok: true, revision: 1 })
    expect(await pub()).toMatchObject({ ok: true, revision: 2 })
    expect(await count("links")).toBe(1)
    expect(await count("statements")).toBe(1)
  })

  it("refuses a different write key", async () => {
    await pub()
    expect(await pub({ p_write_key_hash: h(3) })).toEqual({
      ok: false,
      error: "forbidden",
    })
  })

  it.each([
    ["p_token_hash", "short"],
    ["p_token_hash", null],
    ["p_write_key_hash", "XYZ"],
    ["p_period", "2026-13"],
    ["p_kind", "weekly"],
    ["p_last_due_on", null],
    ["p_payload", [1]],
    ["p_payload", null],
    ["p_payload", { plans: [] }],
    ["p_payload", { plans: "x" }],
    ["p_payload", { plans: [{ name: "no key" }] }],
    ["p_household_label", "x".repeat(81)],
    ["p_roommate_label", "x".repeat(81)],
    // Nothing can be kept alive indefinitely: months and due dates stay near today.
    ["p_period", monthFromNow(-25)],
    ["p_period", monthFromNow(25)],
    ["p_last_due_on", "2099-12-31"],
    ["p_last_due_on", "2000-01-01"],
  ])("rejects bad %s (%j)", async (key, value) =>
    expect(await pub({ [key]: value })).toEqual({ ok: false, error: "invalid" })
  )

  it("rejects payloads over 32 KB", async () =>
    expect(
      await pub({ p_payload: { ...payload(), pad: "x".repeat(33000) } })
    ).toEqual({ ok: false, error: "invalid" }))

  it("expires 60 days after the last due date", async () => {
    const period = monthFromNow(12)
    const result = await pub({ p_period: period, p_last_due_on: `${period}-01` })
    const expected = new Date(Date.parse(`${period}-01T00:00:00Z`) + 60 * 86_400_000)
    expect(result.ok && result.expires_at).toContain(expected.toISOString().slice(0, 10))
  })

  it("never expires sooner than two weeks out, even for old months", async () => {
    const old = monthFromNow(-20)
    await pub({ p_period: old, p_last_due_on: `${old}-22` })
    const { rows } = await rp.db.query<{ ok: boolean }>(
      "select expires_at > now() + interval '13 days' as ok from rp.links"
    )
    expect(rows[0]!.ok).toBe(true)
  })

  it("keeps at most 40 statements per link, dropping the oldest", async () => {
    for (let i = 0; i < 42; i++) {
      const period = monthFromNow(i - 24)
      await pub({ p_period: period, p_last_due_on: `${period}-22` })
    }
    expect(await count("statements")).toBe(40)
    const { rows } = await rp.db.query<{ p: string }>(
      "select min(period) as p from rp.statements"
    )
    expect(rows[0]!.p).toBe(monthFromNow(-22))
  })

  it("past the storage ceiling, accepts edits but nothing new", async () => {
    await pub()
    await rp.db.exec(
      "create or replace function rp.storage_ceiling_bytes() returns bigint language sql stable set search_path = '' as $$ select 0::bigint $$"
    )
    try {
      expect(await pub()).toMatchObject({ ok: true, revision: 2 })
      expect(await pub({ p_period: NEXT, p_last_due_on: `${NEXT}-22` })).toEqual({ ok: false, error: "busy" })
      expect(await pub({ p_token_hash: h(8) })).toEqual({ ok: false, error: "busy" })
    } finally {
      await rp.db.exec(
        "create or replace function rp.storage_ceiling_bytes() returns bigint language sql stable set search_path = '' as $$ select 512::bigint * 1024 * 1024 $$"
      )
    }
  })

  it("trips the new-link circuit breaker but still serves existing links", async () => {
    await pub()
    await rp.db.exec(`
      insert into rp.links (token_hash, write_key_hash, expires_at)
      select encode(sha256(convert_to(g::text, 'utf8')), 'hex'),
             encode(sha256(convert_to('k', 'utf8')), 'hex'),
             now() + interval '1 day'
      from generate_series(1, 300) g`)
    expect(await pub({ p_token_hash: h(9) })).toEqual({ ok: false, error: "busy" })
    expect(await pub()).toMatchObject({ ok: true })
  })

  it("purges expired links opportunistically", async () => {
    await pub({ p_token_hash: h(7) })
    await rp.db.exec("update rp.links set expires_at = now() - interval '1 day'")
    await pub()
    expect(await count("links")).toBe(1)
  })

  it("lets the owner revive their own expired link", async () => {
    await pub()
    await rp.db.exec("update rp.links set expires_at = now() - interval '1 day'")
    expect(await pub()).toMatchObject({ ok: true, revision: 2 })
    expect(await rp.call("view", { p_token_hash: h(1) })).toMatchObject({ ok: true })
  })
})

describe("rp.view / rp.pick", () => {
  it("returns labels and statements newest first", async () => {
    await pub()
    await pub({ p_period: NEXT, p_last_due_on: `${NEXT}-22` })
    await pub({ p_period: NEXT, p_kind: "catchup", p_last_due_on: `${NEXT}-22` })
    const v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
    if (!v.ok) throw new Error("expected ok")
    expect(v.link).toMatchObject({
      household_label: "Unit 3012",
      roommate_label: "Biscuit",
      preferred_plan: null,
    })
    expect(v.link.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(v.link.expires_at).getTime()).toBeGreaterThan(Date.now())
    expect(v.statements.map((s) => [s.period, s.kind])).toEqual([
      [NEXT, "monthly"],
      [NEXT, "catchup"],
      [THIS, "monthly"],
    ])
    expect(v.statements[0]!.payload.plans).toHaveLength(2)
    expect(v.statements[0]).toMatchObject({ chosen_plan: null, revision: 1 })
    expect(JSON.stringify(v)).not.toContain(h(1))
    expect(JSON.stringify(v)).not.toContain(h(2))
  })

  it("hides unknown and expired links", async () => {
    expect(await rp.call("view", { p_token_hash: h(5) })).toEqual({ ok: false, error: "not_found" })
    expect(await rp.call("view", { p_token_hash: "nope" })).toEqual({ ok: false, error: "invalid" })
    await pub()
    await rp.db.exec("update rp.links set expires_at = now() - interval '1 second'")
    expect(await rp.call("view", { p_token_hash: h(1) })).toEqual({ ok: false, error: "not_found" })
    expect(
      await rp.call("pick", { p_token_hash: h(1), p_period: THIS, p_kind: "monthly", p_plan: "weekly" })
    ).toEqual({ ok: false, error: "not_found" })
  })

  it("records a pick, makes it sticky, and drops it when that plan disappears", async () => {
    await pub()
    const pick = (plan: string) =>
      rp.call("pick", { p_token_hash: h(1), p_period: THIS, p_kind: "monthly", p_plan: plan })

    expect(await pick("weekly")).toMatchObject({ ok: true, chosen_plan: "weekly", revision: 2 })
    // Picking the same plan again changes nothing, so calendars aren't churned.
    expect(await pick("weekly")).toMatchObject({ ok: true, revision: 2 })
    expect(await pick("nope")).toEqual({ ok: false, error: "invalid" })

    let v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
    if (!v.ok) throw new Error("expected ok")
    expect(v.link.preferred_plan).toBe("weekly")
    expect(v.statements[0]!.chosen_plan).toBe("weekly")
    expect(v.statements[0]!.chosen_at).toBeTruthy()

    await pub({ p_payload: payload(["full"]) })
    v = await rp.call("view", { p_token_hash: h(1) })
    if (!v.ok) throw new Error("expected ok")
    expect(v.statements[0]!.chosen_plan).toBeNull()
    expect(v.statements[0]!.chosen_at).toBeNull()
  })

  it("keeps the pick when the owner republishes the same plans", async () => {
    await pub()
    await rp.call("pick", { p_token_hash: h(1), p_period: THIS, p_kind: "monthly", p_plan: "weekly" })
    await pub()
    const v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
    if (!v.ok) throw new Error("expected ok")
    expect(v.statements[0]).toMatchObject({ chosen_plan: "weekly", revision: 3 })
  })
})

describe("rp.set_received", () => {
  const received = (cents: number | null, overrides: Record<string, unknown> = {}) =>
    rp.call<{ received_cents: number; revision: number }>("set_received", {
      p_token_hash: h(1),
      p_write_key_hash: h(2),
      p_period: THIS,
      p_kind: "monthly",
      p_received_cents: cents,
      ...overrides,
    })
  const statement = async () => {
    const v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
    if (!v.ok) throw new Error("expected ok")
    return v.statements[0]!
  }

  it("records the owner's running total, bumping the revision only on change", async () => {
    await pub()
    expect(await statement()).toMatchObject({ received_cents: 0, revision: 1 })
    expect(await received(23875)).toEqual({ ok: true, received_cents: 23875, revision: 2 })
    expect(await received(23875)).toEqual({ ok: true, received_cents: 23875, revision: 2 })
    expect(await received(0)).toMatchObject({ ok: true, revision: 3 })
    expect(await statement()).toMatchObject({ received_cents: 0, revision: 3 })
  })

  it("survives the owner republishing the month", async () => {
    await pub()
    await received(5000)
    await pub()
    expect(await statement()).toMatchObject({ received_cents: 5000, revision: 3 })
  })

  it("needs the write key and an existing statement", async () => {
    await pub()
    expect(await received(100, { p_write_key_hash: h(3) })).toEqual({ ok: false, error: "forbidden" })
    expect(await received(100, { p_period: NEXT })).toEqual({ ok: false, error: "not_found" })
    expect(await received(100, { p_token_hash: h(6) })).toEqual({ ok: false, error: "not_found" })
    expect(await received(-1)).toEqual({ ok: false, error: "invalid" })
    expect(await received(null)).toEqual({ ok: false, error: "invalid" })
    expect(await received(100, { p_token_hash: "nope" })).toEqual({ ok: false, error: "invalid" })
  })
})

describe("rp.unpublish / rp.revoke", () => {
  it("need the write key", async () => {
    await pub()
    const month = { p_period: THIS, p_kind: "monthly" }
    expect(
      await rp.call("unpublish", { p_token_hash: h(1), p_write_key_hash: h(3), ...month })
    ).toEqual({ ok: false, error: "forbidden" })
    expect(await rp.call("revoke", { p_token_hash: h(1), p_write_key_hash: h(3) })).toEqual({
      ok: false,
      error: "forbidden",
    })
    expect(
      await rp.call("unpublish", { p_token_hash: h(1), p_write_key_hash: h(2), ...month })
    ).toMatchObject({ ok: true })

    const v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
    expect(v.ok && v.statements).toEqual([])

    expect(await rp.call("revoke", { p_token_hash: h(1), p_write_key_hash: h(2) })).toMatchObject({ ok: true })
    expect(await rp.call("view", { p_token_hash: h(1) })).toEqual({ ok: false, error: "not_found" })
    expect(await rp.call("revoke", { p_token_hash: h(1), p_write_key_hash: h(2) })).toEqual({
      ok: false,
      error: "not_found",
    })
  })
})

describe("privileges", () => {
  it("anon can call the functions but cannot touch the tables or the purge", async () => {
    await pub()
    await rp.db.exec("set role anon")
    try {
      await expect(rp.db.query("select * from rp.links")).rejects.toThrow(/permission denied/)
      await expect(rp.db.query("select * from rp.statements")).rejects.toThrow(/permission denied/)
      await expect(rp.db.query("delete from rp.links")).rejects.toThrow(/permission denied/)
      await expect(rp.db.query("select rp.purge_expired()")).rejects.toThrow(/permission denied/)
      expect(await rp.call("view", { p_token_hash: h(1) })).toMatchObject({ ok: true })
      expect(await pub({ p_token_hash: h(4) })).toMatchObject({ ok: true })
      expect(
        await rp.call("set_received", {
          p_token_hash: h(1), p_write_key_hash: h(2), p_period: THIS, p_kind: "monthly", p_received_cents: 1,
        })
      ).toMatchObject({ ok: true })
    } finally {
      await rp.db.exec("reset role")
    }
  })

  it("service_role can purge", async () => {
    await pub()
    await rp.db.exec("update rp.links set expires_at = now() - interval '1 day'")
    await rp.db.exec("set role service_role")
    try {
      const { rows } = await rp.db.query<{ n: number }>("select rp.purge_expired() as n")
      expect(rows[0]!.n).toBe(1)
    } finally {
      await rp.db.exec("reset role")
    }
    expect(await count("links")).toBe(0)
  })

  it("the migration can be applied twice", async () => {
    const again = await createPgliteBackend({ dataDir: "memory://" })
    await again.migrate()
    expect(await again.call("view", { p_token_hash: h(1) })).toEqual({ ok: false, error: "not_found" })
    await again.close()
  })
})
