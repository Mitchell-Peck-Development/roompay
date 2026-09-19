# RoomPay — design

Date: 2026-09-18
Status: approved (design approved in chat; owner asked for spec → plan → build to run straight through)

## 1. What this is

RoomPay turns the single-file "Rent Ledger" artifact into a real product: a tool for the person
who pays the landlord to work out what each roommate owes, offer them a few ways to pay it across
the month, and hand them a link with the numbers and a calendar of due dates.

Principles, in priority order:

1. **No accounts.** Nothing is tied to a person. Labels are arbitrary ("Unit 3012", "Biscuit").
2. **Per-device by default.** Everything the owner types lives in their browser. Moving between
   devices is an explicit export/import.
3. **Server storage is opt-in and minimal.** Only when the owner publishes a share link do that
   month's numbers reach the database, in the `rp` schema of the shared *Apps Portal* Supabase
   project. No payments, no payment handles, no contact details.
4. **Keep the artifact's functionality; drop its sandbox limits.** Real downloads, the native share
   sheet, real calendar hand-off instead of copy-paste ICS text.

Out of scope for v1: accounts, payments or payment handles, multiple households, push
notifications, analytics, currency conversion, marketing-site content.

## 2. Repository

pnpm workspaces + Turborepo.

```
apps/app        Next.js (App Router) — the product
apps/web        Next.js — placeholder landing page only
packages/ui     shadcn/ui components + theme CSS shared by both apps
packages/core   pure TypeScript: money, splits, plans, proration, ICS, schemas, backup, link builders
supabase/migrations/   SQL for the rp schema (the owner applies these; we never touch the remote DB)
e2e/            Playwright smoke test
docs/superpowers/{specs,plans}
```

`packages/core` has no React and no I/O. Everything that computes money lives there and is built
test-first. The apps import it; the server routes use its schemas to validate what they accept.

## 3. Domain model (per-device data)

All amounts are **integer cents**. Percentages are numbers with up to two decimals.

```ts
AppData = {
  version: 1,
  household: { label: string, currency: string /* ISO 4217, default "USD" */ },
  people: Person[],            // roommates; the owner is implicit and absorbs the remainder
  items: ItemTemplate[],       // configurable line items, ordered
  cadences: Cadence[],         // configurable payment options, ordered
  split: Split,                // household default split
  current: MonthRecord,        // working month, autosaved
  months: MonthRecord[],       // saved snapshots ("History")
  catchups: Record<personId, CatchupRecord>,
  links: Record<personId, LinkSecrets>,
  meta: { createdAt, updatedAt, lastBackupAt?: string, installNudgeDismissedAt?: string },
}

Person       = { id, nickname: string, archived?: boolean }
Split        = { mode: "even" } | { mode: "percent", pct: Record<personId, number> }
ItemSplit    = { mode: "default" } | { mode: "even" } | { mode: "percent", pct: Record<personId, number> } | { mode: "exclude" }
ItemTemplate = { id, label, kind: "fixed" | "variable" | "metered", enabled: boolean,
                 defaultAmountCents?: number,                       // fixed
                 meter?: { unit: string, rate: string /* decimal */, baseFeeCents: number, input: "usage" | "readings" },
                 split: ItemSplit }
Cadence      = { id, key: string, name: string, days: number[] /* days of month, 1–31 */ }
MonthRecord  = { id, period: "YYYY-MM", title: string, lines: MonthLine[], split: Split,
                 participants: { personId, nickname }[],
                 paid: Record<personId, PaidEntry[]>,
                 published: Record<personId, { at: string, hash: string }>,
                 createdAt, updatedAt, savedAt?: string }
MonthLine    = { id, templateId?: string, label, kind, oneOff?: boolean, amountCents: number | null,
                 meter?: { unit, rate, baseFeeCents, input, usage?: string, prev?: string, curr?: string },
                 split: ItemSplit }
PaidEntry    = { id, amountCents: number, date: "YYYY-MM-DD" }
CatchupRecord = { personId, moveIn: "YYYY-MM-DD", estimates: Record<templateId, number /* cents */>,
                  includeNextMonth: boolean, installments: number /* 1–12 */, start: date, end: date,
                  paid: PaidEntry[], published?: { at, hash } }
LinkSecrets  = { token: string, writeKey: string, createdAt: string }
```

Defaults on first run: items Rent (fixed, $0 until set), Service fee (fixed), Trash disposal
(fixed), Sewer, Water, Power (variable); cadences *Pay in full* `[1]`, *Split in two* `[1, 15]`,
*Weekly* `[1, 8, 15, 22]`; split `even`; no roommates yet (first-run prompt asks for a household
label and a first roommate nickname).

### 3.1 Splitting

For each line, participants are the owner plus the month's roommates.

- `even` — every participant has weight 1.
- `percent` — each roommate's weight is their percentage in basis points; the owner's weight is
  `10000 − Σ`. The UI keeps `Σ ≤ 100`.
- `exclude` — the owner pays all of it.
- `default` — use the month's `split`.

`allocate(cents, weights)` uses the largest-remainder method so shares always sum to the line
amount exactly. Negative lines (credits) allocate the absolute value and negate. A roommate's
month share is the sum of their line shares.

### 3.2 Metered lines

`amount = round_half_up(usage × rate × 100) + baseFeeCents`, computed exactly on decimal strings
(BigInt), where `usage` is entered directly or derived as `curr − prev`. When a new month is
started, each metered line's `prev` is seeded from the latest month's `curr` for that template.

### 3.3 Payment plans

For a share of `S` cents, each cadence becomes a plan: its days are clamped to the month's length,
collisions merged, and `S` is divided evenly with the odd cents going to the earliest payments so
the payments always sum to `S`. Each plan reports its largest single payment (the artifact's
"largest payment" badge; it is flagged *ok* when ≤ 55% of `S`).

### 3.4 Move-in catch-up

Per roommate. Full-month share `F` comes from the household's items (fixed defaults plus
per-item estimates) through the same splitting rules. Stub share = `round(F × daysOccupied /
daysInMonth)` where `daysOccupied = daysInMonth − moveInDay + 1`. Optionally add the next full
month (`F`). The combined amount is spread over `n` installments between `start` and `end`: dates
are evenly spaced (rounded to whole days), amounts divided as in 3.3. It produces one plan.

### 3.5 Paid tracking

Local only. Each roommate-month holds a list of `PaidEntry`. The UI shows the roommate's chosen
plan with a *Mark paid* action per row, which appends an entry for that row's amount; rows are
shown as paid greedily, in date order, against the running total. Because it is a running total
rather than per-row flags, it survives the roommate switching plans and handles partial payments.

### 3.6 Saving months

`current` autosaves on every change. *Save* upserts `current` into `months` under its title
(default: the period's name, e.g. "October 2026"; editable). *New month* builds a fresh `current`
from the templates for the chosen period (defaulting to next month once the day-of-month is ≥ 25),
rolling meter readings forward. *Open* loads a saved month into `current`; if `current` differs
from its saved copy the user is asked first. Publishing a month saves it.

### 3.7 Storage, backup, durability

One JSON document in `localStorage` under `roompay:v1`, validated with zod on load; a document that
fails validation is kept aside under `roompay:v1:corrupt` and the app starts fresh rather than
crashing. Cross-tab changes are picked up through the `storage` event.

Backup file: `{ format: "roompay-backup", version: 1, exportedAt, data: AppData }`, exported as a
download or through the native share sheet (`navigator.share` with a file) where available.
Import accepts a file, validates it, and offers **Replace** or **Merge** (people, items, cadences,
months, catch-ups and links are merged by id; on conflict the newer `updatedAt` wins; `current` is
kept unless the incoming one is newer). The file contains link write keys, and the UI says so.

Safari deletes a site's script-writable storage after seven days of browser use without a visit,
which a monthly tool will hit. Home Screen web apps are exempt. So: the app is an installable PWA,
iOS Safari users get an early, dismissible install nudge (with a note that the installed app starts
empty and a one-tap export), `navigator.storage.persist()` is requested after the first save, and
Setup shows "last backup N days ago".

## 4. Sharing

### 4.1 Identity without accounts

The first time the owner shares with a roommate, their device generates two 128-bit random
base64url secrets: a **link token** (it is the roommate's URL) and a **write key** (it never
leaves the device except inside a backup file). The server stores only SHA-256 hashes of each;
hashing happens in the Next.js server so raw secrets never reach the database.

That gives one durable link per roommate. Each month is published *into* it, and only a holder of
the write key can publish, change, or revoke. Importing a backup on a second device carries the
keys, so both devices publish to the same links; publishing is an upsert on
`(link, period, kind)`, last write wins.

If the owner loses their data with no backup, old links become read-only and expire on their own;
the owner sets up again and sends a new link. That is the same as a per-month flow, so the failure
mode is mild.

### 4.2 What is stored

A **snapshot** computed on the owner's device. The server never does money maths.

```ts
SharePayload = {
  v: 1, kind: "monthly" | "catchup", period: "YYYY-MM", title: string, currency: string,
  lines: { label: string, totalCents: number, shareCents: number, detail?: string }[],   // ≤ 60
  totalCents: number, shareCents: number,
  plans: { key: string, name: string, description?: string,
           payments: { date: "YYYY-MM-DD", amountCents: number, label: string }[] }[],   // 1–12 plans, ≤ 24 payments each
  defaultPlan: string,
  catchup?: { moveIn: string, daysOccupied: number, daysInMonth: number,
              stubShareCents: number, nextMonthShareCents: number },
}
```

Alongside it: the household label and the roommate's nickname (the calendar feed needs a name),
the roommate's plan pick, and a revision counter. Each roommate's link carries only that
roommate's shares.

### 4.3 `rp` schema

Tables (RLS enabled, **no policies, no grants** to `anon`/`authenticated`):

- `rp.links` — `id uuid pk`, `token_hash` (unique), `write_key_hash`, `household_label`,
  `roommate_label`, `preferred_plan`, `created_at`, `updated_at`, `expires_at`.
- `rp.statements` — `id`, `link_id → links on delete cascade`, `period`, `kind`, `payload jsonb`
  (≤ 32 KB), `chosen_plan`, `chosen_at`, `revision int`, `last_due_on date`, `published_at`,
  `updated_at`, `unique (link_id, period, kind)`.

Functions — `security definer`, `set search_path = ''`, execute granted to `anon`,
`authenticated`, `service_role` (revoked from `public`). All return `jsonb` shaped
`{ ok: true, … }` or `{ ok: false, error: "<code>" }` rather than raising, so both transports
behave the same. Error codes: `invalid`, `not_found`, `forbidden`, `busy`.

| function | does |
| --- | --- |
| `rp.publish(p_token_hash, p_write_key_hash, p_household_label, p_roommate_label, p_period, p_kind, p_payload, p_last_due_on)` | Creates the link if the token is new (subject to a circuit breaker: > 300 new links in an hour → `busy`), otherwise checks the write key. Upserts the statement, bumps `revision`, clears `chosen_plan` if that plan no longer exists, keeps at most 40 statements per link, rolls `expires_at` to `greatest(max(last_due_on) + 60 days, now() + 14 days)`, and opportunistically purges up to 50 expired links. |
| `rp.unpublish(p_token_hash, p_write_key_hash, p_period, p_kind)` | Deletes one statement. |
| `rp.revoke(p_token_hash, p_write_key_hash)` | Deletes the link and everything under it. |
| `rp.view(p_token_hash)` | Link labels, `preferred_plan`, `expires_at`, and its statements newest first. Expired links read as `not_found`. |
| `rp.pick(p_token_hash, p_period, p_kind, p_plan)` | Checks the plan exists in the payload; sets `chosen_plan`/`chosen_at`, bumps `revision`, and sets the link's `preferred_plan`. |
| `rp.purge_expired()` | `service_role` only. Scheduled daily with `pg_cron` if that extension is installed. |

Manual step for the owner: add `rp` to *Exposed schemas* in the project's API settings.

Because the functions are reachable with the project's publishable key, they defend themselves:
hash-format checks, payload size and shape checks, the statement cap, the new-link circuit
breaker, and expiry.

### 4.4 Server access

`apps/app` talks to `rp` only from the server, through one interface:

```ts
interface RpBackend { call(fn: RpFunction, args: Record<string, unknown>): Promise<RpResult> }
```

- **Supabase backend** — `supabase-js` with the **publishable key** (`SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`), `db.schema = "rp"`, `.rpc()`. No service-role key anywhere.
- **PGlite backend** — in-process Postgres that loads `supabase/migrations/*.sql`. Used by the
  tests and by `pnpm dev` when no Supabase env is set, so the whole product runs locally against
  the *same SQL* the owner will apply. Never used in production: a production server without
  Supabase env answers share requests with `503 sharing_unconfigured`.

Route handlers (all `POST`, JSON, zod-validated, secrets in the body rather than the query string):

| route | body | notes |
| --- | --- | --- |
| `/api/share/publish` | `{ token, writeKey, householdLabel, roommateLabel, payload }` | `last_due_on` derived from the payload |
| `/api/share/unpublish` | `{ token, writeKey, period, kind }` | |
| `/api/share/revoke` | `{ token, writeKey }` | |
| `/api/share/status` | `{ tokens: string[] }` (≤ 12) | per token: picks, revisions, expiry, or `not_found` |
| `/api/share/pick` | `{ token, period, kind, plan }` | called from the roommate page |

### 4.5 Roommate page

`/r/[token]` shows the newest statement; `/r/[token]/[period]` a specific month (`?kind=catchup`
selects the catch-up when both exist). Server-rendered from `rp.view`; `noindex`,
`Referrer-Policy: no-referrer`, and a generic title/description so link previews never show
amounts. Unknown or expired tokens get a plain "this link has ended" page.

Content: household label, statement title, the roommate's total; line items with the bill total
and their share; payment options as selectable cards (dates, amounts, largest-payment badge);
picking one calls `/api/share/pick` and is remembered; then **Add to calendar**. Other published
months are listed underneath. The roommate's device remembers links it has opened
(`roompay:received`), and `/` offers them when there is no owner data — so a roommate who installs
the PWA lands somewhere useful.

### 4.6 Calendar

`GET /r/[token]/calendar.ics`:

- no query → the **feed**: every statement whose last due date is within the past 35 days or in
  the future, each rendered with `chosen_plan ?? link.preferred_plan ?? payload.defaultPlan`
  (falling back to the first plan if that key is missing).
- `?period=&kind=&plan=` → a **one-off** calendar for that statement and plan.

Events are all-day (`DTSTART;VALUE=DATE`), `TRANSP:TRANSPARENT`, with a 9 am alarm, a
description listing the whole plan, and a URL back to the page. UIDs are
`<link.id>-<period>-<kind>-<plan>-<n>@roompay` (built from the row id, never the token) and
`SEQUENCE` is the statement revision, so edits update events in place and a changed pick swaps
them. The feed sets `X-WR-CALNAME`, `REFRESH-INTERVAL`/`X-PUBLISHED-TTL` of one hour, and is
served `text/calendar; charset=utf-8`, `Content-Disposition: inline`, `Cache-Control: no-store`.
An unknown token on the feed returns an empty calendar with `200`, so revoking a link clears the
roommate's calendar instead of raising subscription errors.

**Add to calendar** is device-aware and never goes through Files unless the user asks:

| device | primary | also offered |
| --- | --- | --- |
| iPhone / iPad | one-off `.ics` over https → the native *Add All* sheet | subscribe (`webcal://`) |
| Mac | subscribe (`webcal://` opens Calendar) | one-off `.ics` |
| Android | subscribe in Google Calendar (`calendar.google.com/calendar/r?cid=`) | per-payment Google template links |
| other | Google / Outlook.com / Microsoft 365 subscribe links (`…/calendar/0/addfromweb`) | per-payment links, raw `.ics` |

Every device can open "other calendar apps" to reach the full list. The subscribe option says
plainly that new months can take up to a day to appear in Google Calendar.

### 4.7 Owner side of sharing

On the Month tab each roommate has a share card: their total, a plan preview, and — before first
use — a plain-language consent line describing exactly what publishing stores. *Publish* saves the
month, sends the snapshot, then opens the native share sheet or copies the link. Afterwards the
card shows published state, whether local numbers have changed since (`hash` mismatch → *Update
link*), the roommate's pick (polled through `/api/share/status` on load, on focus, and after
publishing), and paid tracking. *Unpublish month* and *Revoke link* live in a menu; revoking
forgets the local secrets so the next publish creates a fresh link. The Catch-up tab has the same
card for its statement.

## 5. App structure (`apps/app`)

A single client-side shell at `/` with four tabs held in client state (mirrored to `?tab=`):
**Month**, **Catch-up**, **History**, **Setup**. Bottom navigation on phones, top tabs on wider
screens. Setup holds household label and currency, roommates, line items (add / edit / reorder /
disable, kind, meter settings, per-item split), payment options, default split, appearance
(system / light / dark), backup (export, import, last backup), install help, and a plain-language
privacy note. State is a zustand store persisted to `localStorage`; the shell renders a skeleton
until it has hydrated.

Theme: new shadcn token set (warm paper neutrals, deep green primary, amber for warnings), serif
display headings, mono tabular numerals for every amount, light and dark.

PWA: `app/manifest.ts`, generated icons, a small hand-written `public/sw.js` registered in
production only — cache-first for `/_next/static/*`, network-first with a cached fallback for `/`,
network-only for `/r/*` and `/api/*`.

`apps/web` is one static landing page that links to the app (`NEXT_PUBLIC_APP_URL`).

## 6. Error handling

- Money inputs accept `1,648.00`-style text and reject anything else inline; empty variable lines
  count as zero and are shown as "not entered".
- Percent splits that exceed 100% are blocked in the editor with the overage shown.
- Share calls surface `forbidden` ("this link belongs to another device's keys — revoke isn't
  possible; create a new link"), `not_found` (link expired → offer to create a new one), `busy`,
  `sharing_unconfigured`, and network failure as toasts, and never lose local data.
- The roommate page degrades without JavaScript to a readable statement; picking and the calendar
  sheet need JS, but the one-off `.ics` link for the default plan is a plain anchor.
- Corrupt local data and failed imports never overwrite good data.

## 7. Testing

- `packages/core`: vitest, test-first — allocation and rounding invariants (shares and payments
  always sum exactly), metered maths, plan generation (clamping, collisions), catch-up, ICS
  escaping/folding/structure, payload building and hashing, backup round-trip and merge, link
  builders, platform detection.
- `apps/app`: vitest — the migration SQL on PGlite (every function, the privilege boundary as
  `anon`, expiry, caps, circuit breaker), route handlers, and the feed.
- `e2e`: one Playwright smoke run against `next dev` on the PGlite backend — set up, enter a month,
  publish, open the roommate page, pick a plan, fetch the calendar, see the pick on the owner side.
- Not testable from here: native calendar behaviour on real iPhones/Androids. A manual checklist
  ships in the README.

## 8. Configuration

```
apps/app   NEXT_PUBLIC_APP_URL (absolute origin for links/feeds; falls back to the request origin)
           SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY     (server only)
           RP_BACKEND=pglite                          (optional; dev/test only)
apps/web   NEXT_PUBLIC_APP_URL
```

## Addendum (2026-09-19): daily statuses in calendars

Owner request: calendar entries show a status that updates daily. Decided with the owner:

- **Statuses (countdown):** Future (> 3 days out), Pending (1–3 days), Pay now (due today), Overdue (past due, not
  covered), Paid (covered). Title format `Overdue · Pay $238.75 · Unit 3012` / `Paid · $238.75 · Unit 3012`.
- **Paid knowledge:** the owner's paid tracking stays on their device, but the statement's *running received
  total* is synced to the server (`rp.statements.received_cents`, set by `rp.set_received` with the write key —
  migration `20260919000000_rp_received.sql`). The feed pours it into the chosen plan oldest-first (as §3.5 does
  locally); a part-paid payment shows what's left. This amends §1.3 / §4.2: publishing now also stores that total.
- **Only subscribed calendars carry statuses.** One-off imports are frozen copies, so they keep plain titles.
  Subscribe becomes the primary calendar action on every device (amends the §4.6 table: iPhone's primary is now
  subscribe; "Add All" import is the secondary).
- **Refresh daily** (`P1D`), replacing hourly. "Today" is the roommate's date via `?tz=` on the subscribe URL
  (UTC fallback). `SEQUENCE = revision × 5 + status step`; paid events drop the alarm; a statement stays in the
  feed while anything on it is overdue (amends the 35-day window).
- The roommate's page shows the same statuses on their chosen plan, and "received so far".
- `APP_URL` (runtime, server-only) replaces `NEXT_PUBLIC_APP_URL` for `apps/app` — Next inlines `NEXT_PUBLIC_*`
  at build time, even in server code (§8).
