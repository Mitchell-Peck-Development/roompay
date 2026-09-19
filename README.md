# RoomPay

Split rent and bills with roommates. The person who pays the landlord works out what each roommate owes,
offers a few ways to pay it across the month, and sends each roommate a link with their share and the due
dates. The roommate picks a plan and puts the dates in their calendar.

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
apps/web        marketing site — a placeholder landing page for now   → localhost:3000
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
real migration from `supabase/migrations/`, persisted in `apps/app/.pglite/`. So local sharing exercises the same
SQL that production runs. (`RP_PGLITE_DIR=memory://` for a throwaway database.)

```sh
pnpm test        # core logic + the migration on PGlite + the API routes
pnpm e2e         # Playwright: set up → publish → roommate picks → calendar → backup/restore
pnpm lint && pnpm typecheck && pnpm build
```

Adding a shadcn component: `pnpm dlx shadcn@latest add <name> -c apps/app` (it lands in `packages/ui`).

## Database setup (Apps Portal, schema `rp`)

The migration creates everything from scratch and is safe to run more than once.

1. Apply `supabase/migrations/20260918000000_rp_schema.sql` to the Apps Portal project — paste it into the SQL
   editor, or `psql "$APPS_PORTAL_DB_URL" -f supabase/migrations/20260918000000_rp_schema.sql`.
   (Don't `supabase db push` from this repo: Apps Portal's migration history lives in its own repo.)
2. **Dashboard → Project Settings → API → Exposed schemas → add `rp`.** Without this, every call fails.
3. Give `apps/app` the project URL and its **publishable** key (see `apps/app/.env.example`).

### How it's protected

Both tables have RLS on with **no policies and no grants**, so the publishable key can't read or write them
directly. Everything goes through five `SECURITY DEFINER` functions that each demand a secret:

| function | needs | does |
| --- | --- | --- |
| `rp.publish` | link token + write key | creates the link on first use, then adds/updates a month |
| `rp.unpublish` / `rp.revoke` | link token + write key | removes a month / the whole link |
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

- `apps/app`: `NEXT_PUBLIC_APP_URL` (the public https origin — Google and Outlook fetch calendar feeds from
  their own servers, so it must be reachable), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. A production server
  with no Supabase configured answers share requests with `503 sharing_unconfigured`; everything local still works.
- `apps/web`: `NEXT_PUBLIC_APP_URL` pointing at the app.

## Sharing and calendars

One link per roommate, and it lasts: each month is published *into* it (`/r/<token>`, `/r/<token>/<YYYY-MM>`).
The roommate can subscribe once to `/r/<token>/calendar.ics`, and every month published afterwards shows up with
the plan they last picked. The feed sets `SEQUENCE` from each statement's revision, so edits update events in
place. Revoking a link empties the feed rather than erroring. If the database is unreachable the feed answers
`503`, so calendars keep what they have.

"Add to calendar" is device-aware and avoids dropping a file in Downloads:

| device | primary | also |
| --- | --- | --- |
| iPhone / iPad | one-off `.ics` served inline → iOS "Add All" sheet | subscribe (`webcal://`) |
| Mac | subscribe in Calendar (`webcal://`) | this month only (`.ics`) |
| Android | subscribe in Google Calendar | Outlook.com; per-payment Google links (open the Calendar app) |
| other | Google / Outlook.com subscribe | Microsoft 365, per-payment links, raw `.ics` |

### Check on real devices

These can't be covered by automated tests. Try them against a deployed build (subscriptions need a public URL):

- [ ] iPhone Safari: open a share link → **Add to Calendar** shows the "Add All" sheet; events land on the right days with a 9 am alert.
- [ ] iPhone: **Subscribe instead** → Calendar's subscribe prompt. Publish another month → it appears after a refresh.
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
