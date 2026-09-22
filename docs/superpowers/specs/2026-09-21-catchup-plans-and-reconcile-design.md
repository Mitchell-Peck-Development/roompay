# Catch-up schedules, and bill changes that keep what's been paid

Date: 2026-09-21
Status: approved (design approved in chat; owner asked for spec → plan → build to run straight through)

Two changes, one branch (`feat/catchup-plans-and-reconcile`).

## 1. Problems

**A catch-up offers no choice.** On a monthly link the roommate picks how to pay from the
household's schedules. A catch-up link shows one fixed schedule. The roommate page, the pick API
and `rp.pick` already handle picks on catch-ups — `buildCatchupPayload` just ships
`plans: [result.plan]`, so the picker falls into its single-plan layout.

**A bill change rewrites paid payments.** `buildPlans` → `scheduleEvenly` rebuilds every schedule
as *new total ÷ number of dates* with no memory of what's been paid, and `paidProgress` pours the
received total into the re-cut rows oldest-first. Reproduced with the core functions:

| | owner's tracker | roommate's calendar (on the 16th) |
| --- | --- | --- |
| $1000 over the 1st & 15th, $500 received | 1st $500 paid · 15th $500 due | 1st Paid · 15th Overdue |
| bill corrected to $1100 | **1st $550 partial** · 15th $550 due | **1st Overdue ($50 left)** · 15th Overdue |

With four payments, a row that was paid flips to overdue. The owner expects paid payments to stay
paid, and the difference to land on the payments still to come.

## 2. Catch-up schedules

`catchupPlans({ result, record, cadences }): Plan[]` in `catchup.ts`:

1. **The owner's installment plan first**, unchanged in key (`CATCHUP_PLAN_KEY`), dates and name,
   and still the payload's `defaultPlan`. It gains a description: "Evenly spaced from Sep 14 to
   Oct 1."
2. **Then one plan per household cadence**, in cadence order, keyed and named like the monthly
   plans so a pick carries across. Its dates are every cadence day that falls within
   `[record.start, record.end]` inclusive, across every month the window touches, clamped the way
   monthly dates are (`dateInPeriod`), de-duplicated and sorted. The catch-up total is spread over
   them with `scheduleEvenly`. Description: "On the 1st and 15th, like every month."
3. A cadence with **no day in the window** is not offered.
4. A plan whose date list **equals an earlier plan's** is dropped (first one wins, so the owner's
   plan always survives).
5. At most **12 plans** (the payload schema's cap).

`buildCatchupPayload` takes `cadences` and ships these plans. `computeCatchup` is unchanged —
`result.plan` stays the owner's plan.

**Owner side.** `ShareCard` already follows the roommate's pick into `PaidTracker`. The Catch-up
tab's copy stops saying the roommate "gets one plan", and its preview table shows the owner's plan
as it ships in the payload (i.e. reconciled, §3).

**The link's preferred plan.** `rp.pick` also stores a pick as the link's `preferred_plan`, which
new months inherit. Cadence keys carry over usefully; the owner's `catchup` key exists on no month,
so picking it would silently drop the roommate's monthly preference. Migration
`20260921000000_rp_pick_preference.sql` redefines `rp.pick` so it updates `preferred_plan` only
when `p_kind = 'monthly' or p_plan <> 'catchup'`. The app is safe to deploy before the migration is
applied: until then, the only effect is that their next month opens on the owner's default.

## 3. Reconciliation

### The rule

`reconcilePlan(plan, published, receivedCents): Plan` in a new `reconcile.ts`. `plan` is the freshly
built schedule for the current total; `published` is the same plan's rows as last published
(`PublishedPlan = { key, payments: { date, amountCents }[] }`).

1. No `published` rows, or nothing received → return `plan` unchanged.
2. Walk the published rows oldest-first, pouring `receivedCents` into them. A row is **settled**
   while all of these hold:
   - it's within the first `n − 1` rows (`n` = rows in `plan`) — the last row always absorbs a
     change, since there's no later payment to put it on;
   - its date equals the date of the same row in `plan` — so a changed schedule re-spreads;
   - its amount is positive and fully covered by what's left of the pool;
   - the settled rows so far plus this one don't exceed the new total — so a bill that drops below
     what's been paid gives way instead of going negative.
3. Settled rows keep their published amounts. The rest of the total is spread evenly over the
   remaining rows with `splitEven` (odd cents to the earliest). Dates, labels, key, name and
   description come from `plan`.

`reconcilePlans(plans, published, receivedCents)` applies it to each plan against the published
plan with the same key.

Worked cases (published → new total, received → result):

| case | published | new total | received | result |
| --- | --- | --- | --- | --- |
| bill goes up | 500, 500 | 1100 | 500 | **500**, 600 |
| bill goes down | 500, 500 | 900 | 500 | **500**, 400 |
| all paid, bill goes up | 500, 500 | 1100 | 1000 | **500**, 600 → last row $100 left |
| genuine part-payment | 500, 500 | 1100 | 200 | 550, 550 (row 1 shows $200 in) |
| drops below what's paid | 500, 500 | 400 | 500 | 200, 200 → $100 over |
| one payment | 1000 | 1100 | 1000 | 1100 → $100 left |
| dates changed | 9/1, 9/15 | — | — | even split, as today |

**Nothing changed means nothing changes.** When the total equals the published total and the
published rows are an even split, settling a prefix and re-splitting the remainder reproduces the
same rows to the cent (`splitEven` hands odd cents to the earliest rows, and removing a prefix
leaves a sequence the remainder's split reproduces). So marking a payment received never makes a
statement read "the numbers changed since you published".

### Where the published rows live

`publishedSchema` gains `plans?: PublishedPlan[]` (≤ 12 plans, ≤ 24 payments each), wrapped in
`.catch(undefined)`: it's a cache, so a damaged copy is dropped without taking its month down in
`parseAppData`'s lossy path. `publishedPlans(payload)` (in `share.ts`) extracts it. `ShareCard`
writes it with every publish. It rides in backups with the rest of `published`.

### Links published before this change

They have no local copy — which is exactly the owner's current month. `/api/share/status` adds each
statement's `plans` (dates and amounts from the stored payload — the owner's own data, reachable
with the owner's token). When `ShareCard` sees a published statement with no local `plans` and the
server has them, it writes them into the local `published` once. The next **Update link** then ships
a reconciled schedule.

### Where it's applied

- `buildMonthlyPayload` reconciles against `month.published[personId]?.plans` with
  `paidTotal(month.paid[personId])`.
- `buildCatchupPayload` reconciles against `record.published?.plans` with `paidTotal(record.paid)`.
- The Month tab's plan preview shows the payload's plans when there is a payload.

The roommate page and the calendar feed need no change: they read the payload's plans and the
server's received total.

## 4. Testing

- **Core, test-first:** `reconcilePlan` for every row of the table above, plus "nothing changed"
  byte-identity across odd-cent totals; `reconcilePlans` matching by key; `catchupPlans` for window
  clipping across a month boundary, day-31 clamping, a cadence with no day in the window, date-list
  de-duplication, owner plan first and default, the 12-plan cap; both builders reconciling;
  `published.plans` round-tripping, and a damaged one dropped without losing its month.
- **App:** the status route returns `plans`; on PGlite, picking `catchup` on a catch-up leaves
  `preferred_plan` alone while picking a cadence key still sets it.
- **E2E:** (1) publish, mark the first payment received, raise a bill, Update link — the owner's
  tracker and the roommate's page still show the first payment Paid and the difference on the next;
  (2) on a catch-up link the roommate picks a household schedule and the owner's card shows it.

## 5. Out of scope

- Adding a new payment row to carry an increase after everything's been paid (the last row absorbs
  it instead).
- Preserving settled rows across a change to the schedule itself (cadences, installments, dates).
- Any change to how the server stores or computes statements beyond `rp.pick`'s preference rule.
