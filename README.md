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
apps/app        everything served on one origin (Next.js 16, App Router)  → localhost:3001
  /               the landing page
  /app            the product
  /r/<token>      a roommate's share link
packages/core   all the money logic: splits, plans, catch-up, ICS, share payloads, backup (pure TS, tested)
packages/ui     shadcn/ui components and the theme
supabase/migrations   the rp schema — applied by hand, see below
e2e/            Playwright smoke tests
```

One deployment, one origin. The landing page, the app and the share links are routes in the same
Next app, so a share link is short (`roompay.example/r/abc…`) and the app needs no second domain.

## Develop

```sh
pnpm install
pnpm dev:app        # everything, with a built-in database — no Supabase needed
```

The landing page is at <http://localhost:3001>, the app itself at <http://localhost:3001/app>.

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

One Vercel project (or similar) from this repo, with root directory `apps/app`.

- `APP_URL` (the public https origin — Google and Outlook fetch calendar feeds from
  their own servers, so it must be reachable), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. A production server
  with no Supabase configured answers share requests with `503 sharing_unconfigured`; everything local still works.

  **Publishing returns 503 and Supabase *is* configured?** The 503 only happens when one of those
  two names is unset *in the server process*, so the response body and the deploy log both name
  which one. The usual causes, in order:

  1. **The names don't match.** Supabase's own Vercel integration supplies `SUPABASE_ANON_KEY` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` — never `SUPABASE_PUBLISHABLE_KEY`, which is what this app
     reads. Copy the publishable key across under that exact name.
  2. **Set on the wrong environment, or not redeployed.** Vercel only picks up new variables on the
     next deployment, and Preview and Production are scoped separately.
  3. **Local `next start`.** That runs with `NODE_ENV=production`, so it won't fall back to PGlite
     the way `pnpm dev:app` does — put both variables in `apps/app/.env.local` (the app directory,
     not the repo root) or run with `RP_BACKEND=pglite`.

  A 503 from `/r/<token>/calendar.ics` is a different thing: that one means the database was
  unreachable, and it's deliberate so subscribed calendars keep what they already have.

`APP_URL` also makes the landing page's Open Graph image, its canonical URL and the sitemap
absolute, so links preview correctly when shared.

### The installed app lives at `/app`

The web app manifest keeps `id: "/"` — that string is the installed app's identity, so changing it
would read as a different app and install a second copy beside anyone's existing one — while
`start_url` and `scope` are `/app`. Share links at `/r/…` sit outside that scope deliberately: they
belong to the roommate and should open in a browser, not in the owner's installed app.

The service worker still registers at `/`, because anyone who installed an earlier version already
has a worker there, and re-registering updates it in place instead of orphaning it. Its cache
version is bumped so the old one — which held the app shell under `/`, where the landing page is
now — is dropped on activation. Local data is keyed to the origin, not the path, so nothing is
lost by the move.

## Setting up, in as many sittings as it takes

The first run asks three questions — what the place is called, who's splitting it, what the fixed
charges cost — and stops there. Everything else that decides whether the numbers come out right
(when each bill covers, how it splits, how a roommate can pay it) is a **checklist at the top of
Setup**: what's done, what's next, and a button that scrolls you to the one card that does it. The
app opens on that checklist rather than the Month tab until the required steps are done, and every
other tab carries a one-line *Finish setting up · 3 of 6* banner back to it. It disappears on its
own once the list is empty.

Three of those steps can't be read off the data — a default split of "evenly" and the stock
payment options look exactly the same whether they were chosen or never opened. Those are ticked
off by hand, and the tick is what `prefs.reviewed` stores (`packages/core/src/setup.ts`). The rest
are inferred: a household has a name or it doesn't, every fixed item has an amount or it doesn't.

Which matters because **the Month tab is not where you set things up** — and until now it didn't say
which of its edits outlive the month. They don't all behave the same way, so each one says what it
does: a fixed charge carries its new amount into later months and the line reads *every month:
$1,700.00*; a due date set by hand keeps its distance from the billed month next time; a split
changed for one line stays there, and offers *Split it this way every month* rather than letting
"I set that up" and "it went back to normal" be the same story.

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
- **A meter isn't read on the 1st**, so an item can also carry the day its cycle turns over
  (`coverage.startDay`). The offset still names the month the service *ends* in, so power read on
  the 28th and billed for last month covers *28 Jul – 28 Aug* on September's statement, due
  whenever you say — 21 September, in a real one. October's is *28 Aug – 28 Sep*. Both ends are
  inclusive, as everywhere else here, so the reading day closes one statement and opens the next,
  the way the reading itself does. A day past the end of a short month lands on its last day.
  Leaving the day empty is plain calendar months; the 1st is a reading day like any other and
  means something different (*1 Jul – 1 Aug*). Setup shows the rule worked out against the month
  you're billing, so it can be checked rather than imagined.
- **Either direction.** A window redrawn by hand on the Month tab offers to become the item's rule
  (*Cover this stretch every month*) whenever it's one a month could repeat — `coverageOf` reads a
  window back into a rule and only accepts it if rebuilding it gives the same dates, so a one-off
  stretch stays a one-off.
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

## Catch-ups, credits and splits

**A catch-up owns the months it settles.** While it's open, that roommate's part-month (and the next, if it's
included) is billed through the catch-up alone: the Month tab shows their share but hands the billing over, so
they're never asked for the same month twice. Estimates give way to the real figures as soon as a month has
amounts in it. Marking it settled hands those months back to the usual flow.

**The Catch-up tab shows up only when it's needed.** On *auto* it's in the tab bar from the month before
someone moves in until the last bill covering their first months has landed — a utility billed a month in
arrears means the tab stays through November for a September arrival — and for as long as an open catch-up's
installments run. Every other month it's out of the way. **Setup → Catch-up tab** forces it off or on instead.

**Every total opens onto one roommate's side of it.** On the Month tab, a share expands to that roommate's part
of each line, prorated days and all; on the Catch-up tab, their share of a typical full month and the combined
catch-up do the same. The rows always add up to the figure on the row that opened them.

**A credit isn't a split.** Money coming back only has two sensible destinations, so that's what it asks:

| | |
| --- | --- |
| **Off the whole bill** | Before the split — the total drops and everyone's share drops with it. |
| **Off someone's share** | After the split — the full amount comes off the people you pick, and yours doesn't move. One roommate, several (shared between them), or every roommate, which follows the household as people come and go. |

That needs a split mode percentages can't express — *evenly among exactly these people* — since three people at
33.33% leaves a hundredth of a percent on you. It's available for charges too, as "Only some of us".

## History as a spreadsheet

**History → Export CSV** writes every saved month: one row per bill line, then a `Total` row, with a column for
the bill amount, your share, and each person's share, what they've paid and when that month was shared. Each line
also carries the service window it pays for (`Covers from` / `Covers to`) and its due date, as ISO dates — which
is what explains a share that isn't a clean split, since a bill billed in arrears is only owed by whoever lived
here during it. Move-in catch-ups come along as their own rows (`Prorated`, `Next month`, `Total`), and their
item rows add up to that total. Months run oldest first, amounts are plain numbers so they add up, and the file
carries a BOM so Excel reads it as UTF-8. It's a report, not a backup — it can't be imported.

## Local data and backups

The owner's data is one JSON document in `localStorage` (`roompay:v1`), read back through `parseAppData`.

Because it's one blob, a strict all-or-nothing parse would trade a year of saved months for a single bad value.
So anything unreadable is dropped on its own — that month, that roommate, that bill line — and everything else is
kept. A damaged month keeps the lines that still parse; a damaged setting falls back to its default. The original
document is copied to `roompay:v1:corrupt` and the app says what it skipped, with a button to save that copy.
Only a document that is missing or not an object at all starts fresh.

Two rules keep a bill's own settings from being quietly rewritten: a period or due date set by hand on one
month's bill outlives edits to its item (renaming the sewer bill doesn't undo the quarter it covers), while a
line still matching its item's settings follows when those change.

**Setup → Backup** exports a file (or hands it to the share sheet on phones). Importing offers **Merge** (by id;
the newer edit wins) or **Replace**. The file contains the keys that control share links, so it should be kept
private.

Safari deletes a site's storage after seven days of browser use without a visit, and a monthly tool would hit
that. Home Screen apps are exempt, so the app is an installable PWA, iPhone users are nudged to install early
(and to export first, because the installed app starts empty), and the app asks for persistent storage.
