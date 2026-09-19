# RoomPay

Split rent and bills with roommates. The person who pays the landlord works out what each roommate owes,
offers a few ways to pay it across the month, and sends each roommate a link with their share and the due
dates. The roommate picks a plan and puts the dates in their calendar.

- **Bills are billed for the period they cover.** The water statement that lands at the end of
  September is August's usage, so August's residents owe it — not whoever's on September's split.
- **No accounts.** Roommates are arbitrary labels ("Biscuit", "Room B"), never names.
- **Per-device.** Everything the owner enters lives in their browser. A backup file moves it between devices.
- **Server storage is opt-in.** Only publishing a share link sends anything to the server: a snapshot of that
  statement's numbers, stored in the `rp` schema of the Apps Portal Supabase project. Nothing about people,
  nothing about payment accounts. RoomPay never moves money.

Design: [`docs/superpowers/specs/2026-09-18-roompay-design.md`](docs/superpowers/specs/2026-09-18-roompay-design.md) ·
Plan: [`docs/superpowers/plans/2026-09-18-roompay.md`](docs/superpowers/plans/2026-09-18-roompay.md)

## Layout

```
apps/app        the product (Next.js 16, App Router)                  → localhost:3001
apps/web        the landing page (Next.js 16)                         → localhost:3000
packages/core   all the money logic: splits, plans, catch-up, ICS, share payloads, backup (pure TS, tested)
packages/ui     shadcn/ui components and the theme, shared by both apps
supabase/migrations   the rp schema — applied by hand, see below
e2e/            Playwright smoke tests
```

## Develop

```sh
pnpm install
pnpm dev:app        # the app, with a built-in database — no Supabase needed
pnpm dev:web        # the landing page
```

With no `SUPABASE_URL` set, the app runs its share links on **PGlite**: an in-process Postgres that loads the
real migrations from `supabase/migrations/`, persisted in `apps/app/.pglite/`. So local sharing exercises the same
SQL that production runs, and a running dev server re-applies the migrations when they change.
(`RP_PGLITE_DIR=memory://` for a throwaway database.)

```sh
pnpm test        # core logic + the migration on PGlite + the API routes
pnpm e2e         # Playwright, on a production build at :3101: publish → pick → calendar → paid → backup
pnpm lint && pnpm typecheck && pnpm build
```

Adding a shadcn component: `pnpm dlx shadcn@latest add <name> -c apps/app` (it lands in `packages/ui`).

## Database setup (Apps Portal, schema `rp`)

The migrations create everything from scratch, and each is safe to run more than once. Apply them in order:

1. `supabase/migrations/20260918000000_rp_schema.sql` — the schema, tables and functions.
2. `supabase/migrations/20260919000000_rp_received.sql` — the received total behind "Paid" / "Overdue".

   Paste each into the SQL editor, or `psql "$APPS_PORTAL_DB_URL" -f <file>`. (Don't `supabase db push` from
   this repo: Apps Portal's migration history lives in its own repo.)
3. **Dashboard → Project Settings → API → Exposed schemas → add `rp`.** Without this, every call fails.
4. Give `apps/app` the project URL and its **publishable** key (see `apps/app/.env.example`).

### How it's protected

Both tables have RLS on with **no policies and no grants**, so the publishable key can't read or write them
directly. Everything goes through `SECURITY DEFINER` functions that each demand a secret:

| function | needs | does |
| --- | --- | --- |
| `rp.publish` | link token + write key | creates the link on first use, then adds/updates a month |
| `rp.unpublish` / `rp.revoke` | link token + write key | removes a month / the whole link |
| `rp.set_received` | link token + write key | the owner's running total received for a statement |
| `rp.view` | link token | what the roommate sees |
| `rp.pick` | link token | records the roommate's choice of plan |

Tokens and write keys are random 128-bit values generated on the owner's device. The app server SHA-256 hashes
them before calling the database, so the database never sees or stores them. The write key never leaves the
owner's device except inside their own backup file.

Because the functions are reachable with a public key, they defend themselves: strict input checks, 32 KB per
statement, 40 statements per link, months within two years of today and due dates near their month, at most
300 new links an hour, a 512 MB storage ceiling past which only edits are accepted
(`rp.storage_ceiling_bytes()`), and expiry 60 days after a link's last due date. Expired links are purged as
publishing happens, and daily by `pg_cron` if that extension is installed.

## Deploy

Two Vercel projects (or similar) from this repo, with root directories `apps/app` and `apps/web`.

- `apps/app`: `APP_URL` (the public https origin — Google and Outlook fetch calendar feeds from
  their own servers, so it must be reachable), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. A production server
  with no Supabase configured answers share requests with `503 sharing_unconfigured`; everything local still works.

  **Publishing returns 503 and Supabase *is* configured?** The 503 only happens when one of those
  two names is unset *in the server process*, so the response body and the deploy log both name
  which one. The usual causes, in order:

  1. **The names don't match.** Supabase's own Vercel integration supplies `SUPABASE_ANON_KEY` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` — never `SUPABASE_PUBLISHABLE_KEY`, which is what this app
     reads. Copy the publishable key across under that exact name.
  2. **Set on the wrong project.** This repo deploys twice; the variables belong to the project
     rooted at `apps/app`, not `apps/web`.
  3. **Set on the wrong environment, or not redeployed.** Vercel only picks up new variables on the
     next deployment, and Preview and Production are scoped separately.
  4. **Local `next start`.** That runs with `NODE_ENV=production`, so it won't fall back to PGlite
     the way `pnpm dev:app` does — put both variables in `apps/app/.env.local` (the app directory,
     not the repo root) or run with `RP_BACKEND=pglite`.

  A 503 from `/r/<token>/calendar.ics` is a different thing: that one means the database was
  unreachable, and it's deliberate so subscribed calendars keep what they already have.
- `apps/web`: `NEXT_PUBLIC_APP_URL` pointing at the app, and `NEXT_PUBLIC_SITE_URL` — its own public
  origin, which makes the generated Open Graph image and the sitemap absolute so shared links
  preview correctly.

## Offset bills, residency and the Bills calendar

A bill has three dates, and they move independently. The sewer statement that turns up in
September is **billed** in September, **covers** August's service, and isn't **due** until
1 October. RoomPay keeps all three apart, because each answers a different question:

| | what it is | what it decides |
| --- | --- | --- |
| **Billed** | the statement it lands on (`month.period`) | which month's paperwork it belongs to |
| **Covers** | the stretch of service it pays for (`covers: { start, end }`) | **who owes it** |
| **Due** | when the money has to leave (`dueDate`) | when you pay it, and where it sits on the calendar |

Shares are weighted by the days of a bill's *coverage* each roommate was actually here — one
mechanism for bills in arrears, mid-month move-ins and move-outs alike. A due date never moves
money between people; it only moves the bill around the calendar.

- **Coverage** lives on the item (Setup → Line items): *this month*, *last month*, *2 months
  back*, and how many months one bill spans. Rent and fees default to the month they're billed in;
  water, sewer and power default to the month before.
- **Due** lives there too, as a month offset plus a day — *the following month*, the 1st — so a
  bill billed now can fall due next month, or (for a landlord who wants rent early) the month
  before. It's clamped into whatever month it lands in, so the 31st is the 28th in February.
- Both are concrete on each month's line and overridable for a single month from that bill's
  panel — for the quarterly sewer bill, or the one that turned up late. Setting a date by hand
  remembers the *gap* from the billed month, not just the day, so next month's statement comes
  out right.
- **Residency** lives on the person (Setup → Roommates). Leave it empty and nothing prorates, so
  existing data behaves exactly as before. Set a move-in date and every bill is weighted by it.
  The Catch-up tab's move-in date is the same field.
- **Whatever a roommate doesn't owe falls to the owner**, never to the other roommates — nobody
  pays more because someone moved in late.
- **Day-exact.** Weights are whole days over the window's day count, not a rounded fraction, so
  the parts still add up to the cent.

The **Bills** tab lays a statement out as a calendar, following the due dates wherever they land:
one grid per month the statement actually has payments in, so a bill billed in September and due
1 October appears under October, labelled *due after this statement*. Bills with no due date sit
in "Not on the calendar" until you give them one.

A move-in catch-up works the same way, statement by statement: a roommate arriving in September
owes nothing of the water bill that September's statement carries (it's August's), and picks it up
prorated on October's statement instead.

## Sharing and calendars

One link per roommate, and it lasts: each month is published *into* it (`/r/<token>`, `/r/<token>/<YYYY-MM>`).
The roommate can subscribe once to `/r/<token>/calendar.ics`, and every month published afterwards shows up with
the plan they last picked.

### Daily statuses

In a subscribed calendar every payment's title leads with where it stands — the feed is worked out fresh each
time it's fetched, and asks calendars to refresh daily (`REFRESH-INTERVAL`/`X-PUBLISHED-TTL` of `P1D`; Google may
take up to a day):

| status | when |
| --- | --- |
| **Future** | due more than 3 days from today |
| **Pending** | due in 1–3 days |
| **Pay now** | due today |
| **Overdue** | past due and not covered by what's been received |
| **Paid** | covered by what's been received |

e.g. `Overdue · Pay $238.75 · Unit 3012`, `Paid · $238.75 · Unit 3012`. "Received" is the owner's running total:
marking a payment received on their device syncs that one number to the statement, and it's applied to the
payments oldest-first (so early or odd-sized payments line up; a part-paid one shows what's left). Paid events
drop their reminder. "Today" is the roommate's: the subscribe buttons add `?tz=<their time zone>` (UTC
otherwise). A statement stays in the feed while anything on it is overdue, else for 35 days past its last date.

`SEQUENCE` is `revision × 5 + status step`, so it rises with every edit and every step towards paid, and calendars
update events in place. Revoking a link empties the feed rather than erroring. If the database is unreachable
the feed answers `503`, so calendars keep what they have.

### Add to calendar

Subscribing comes first on every device — it's what gets the daily statuses. A one-off import is offered second
and carries no status (it's a frozen copy). Nothing drops a file in Downloads unless asked:

| device | primary | also |
| --- | --- | --- |
| iPhone / iPad | subscribe in Calendar (`webcal://`) | just this month: `.ics` served inline → iOS "Add All" sheet |
| Mac | subscribe in Calendar (`webcal://`) | just this month (`.ics`) |
| Android | subscribe in Google Calendar | Outlook.com; per-payment Google links (open the Calendar app) |
| other | Google / Outlook.com subscribe | Microsoft 365, per-payment links, raw `.ics` |

### Check on real devices

These can't be covered by automated tests. Try them against a deployed build (subscriptions need a public URL):

- [ ] iPhone Safari: **Subscribe in Calendar** → Calendar's subscribe prompt; events show "Future · Pay …" etc. with a 9 am alert.
- [ ] Next day: statuses have moved on (e.g. Pending → Pay now); mark one received on the owner's side → it reads "Paid" after the next refresh.
- [ ] iPhone: **Add just this month** shows the "Add All" sheet, with plain "Pay …" titles. Publish another month → the subscription gains it.
- [ ] Opening a link from Messages / WhatsApp: the preview shows "Your share · RoomPay" and no amounts.
- [ ] Mac Safari/Chrome: **Subscribe in Calendar** opens Calendar.app.
- [ ] Android Chrome: **Subscribe in Google Calendar** adds the calendar; a per-payment link opens the Calendar app.
- [ ] Outlook.com: subscribe link adds the calendar.
- [ ] Owner changes a number and taps **Update link** → the roommate's subscribed events update in place (no duplicates).
- [ ] Owner deletes the link → the roommate's subscribed calendar empties on its next refresh.
- [ ] iPhone: install to Home Screen, import a backup, and the data is still there after a week away.

## Local data and backups

The owner's data is one JSON document in `localStorage` (`roompay:v1`), validated on load. If it can't be read it
is set aside (`roompay:v1:corrupt`) rather than overwritten. **Setup → Backup** exports a file (or hands it to the
share sheet on phones). Importing offers **Merge** (by id; the newer edit wins) or **Replace**. The file
contains the keys that control share links, so it should be kept private.

Safari deletes a site's storage after seven days of browser use without a visit, and a monthly tool would hit
that. Home Screen apps are exempt, so the app is an installable PWA, iPhone users are nudged to install early
(and to export first, because the installed app starts empty), and the app asks for persistent storage.
