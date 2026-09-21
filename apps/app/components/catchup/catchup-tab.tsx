"use client"

import {
  type CatchupResult,
  addDays,
  buildCatchupPayload,
  catchupPeriods,
  computeCatchup,
  formatLongDate,
  formatPeriod,
  formatWindow,
  isOffset,
  itemsWithRecentDefaults,
  lineAmountCents,
  maxOffsetMonths,
  periodOf,
  todayISO,
} from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { DateField } from "@/components/common/date-field"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { CheckCheck, History, Minus, Plus } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"
import { Breakdown } from "@/components/common/breakdown"
import { MoneyInput } from "@/components/common/money-input"
import { RoommateSwitcher } from "@/components/common/roommate-switcher"
import { SectionCard } from "@/components/common/section-card"
import { ShareCard } from "@/components/month/share-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

/**
 * For a roommate who moves in mid-month: prorate the partial month, add the
 * next full one, and spread the lot over even installments so nothing lands
 * as one oversized payment.
 */
export function CatchupTab() {
  const data = useData()
  const people = data.people
    .filter((p) => !p.archived)
    .map((p) => ({ personId: p.id, nickname: p.nickname }))
  const [selected, setSelected] = React.useState(people[0]?.personId ?? "")
  const person = people.find((p) => p.personId === selected) ?? people[0]
  const record = person ? data.catchups[person.personId] : undefined

  React.useEffect(() => {
    if (person && !record) actions.ensureCatchup(person.personId, todayISO())
  }, [person, record])

  // Bills that vary start from whatever was last entered for them. These are
  // cheap sums over one household's data, and the whole document is replaced
  // on every edit, so they're left to the compiler rather than memoised here.
  const items = itemsWithRecentDefaults(data)
  // The month being worked on counts as real as soon as it has figures in it,
  // so the catch-up stops calling this month's bill an estimate. An empty one
  // would only report zeros, so it waits until something is entered.
  const entered = data.current.lines.some((line) => lineAmountCents(line) !== null)
  const result = record
    ? computeCatchup({
        record,
        items,
        split: data.split,
        people: data.people,
        months: entered ? [data.current, ...data.months] : data.months,
      })
    : null

  if (!person) {
    return (
      <SectionCard title="Move-in catch-up" description="Add a roommate in Setup first.">
        <span />
      </SectionCard>
    )
  }
  if (!record || !result) return null

  const who = person.nickname || "your roommate"
  const periods = catchupPeriods(record)
  const settled = Boolean(record.closedAt)
  const months = periods.map((p) => formatPeriod(p))
  const monthList = months.length > 1 ? `${months.slice(0, -1).join(", ")} and ${months.at(-1)}` : months[0]
  const offsetMonths = maxOffsetMonths(items)
  const patch = (next: Parameters<typeof actions.patchCatchup>[1]) => actions.patchCatchup(person.personId, next)
  const setDate = (key: "moveIn" | "start" | "end") => (value: string | null) => {
    if (value) patch({ [key]: value })
  }
  const payload =
    result.combinedCents > 0
      ? buildCatchupPayload({ result, record, cadences: data.cadences, currency: data.household.currency })
      : null
  // Your installments as they'll go out — reconciled, once they've started paying.
  const ownerPlan = payload?.plans.find((p) => p.key === result.plan.key) ?? result.plan

  return (
    <>
      <RoommateSwitcher people={people} value={person.personId} onChange={setSelected} />

      <aside
        className={`rounded-xl p-4 text-sm ${settled ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}
      >
        {settled ? (
          <>
            <p className="font-semibold">This catch-up is settled.</p>
            <p className="mt-1 leading-relaxed">
              {monthList} {months.length > 1 ? "bill" : "bills"} normally again on the Month tab.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">
              {monthList} {months.length > 1 ? "are" : "is"} billed here, not on the Month tab
            </p>
            <p className="mt-1 leading-relaxed">
              {who} settles {months.length > 1 ? "both months" : "it"} in one catch-up, on whichever schedule they
              pick, so they&apos;re never asked for the same month twice. Their share still shows in each
              month&apos;s ledger.
            </p>
          </>
        )}
      </aside>

      <SectionCard
        title="Move-in stub period"
        description="Bills each item against the service it pays for, not the month it lands in — so a utility billed in arrears skips the first statement — then smooths the lot into one plan instead of a small charge now and a big one right after."
      >
        <div className="grid gap-3 min-[420px]:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-in">Move-in date</Label>
            <DateField id="move-in" value={record.moveIn} onChange={setDate("moveIn")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="days-occupied">Days occupied that month</Label>
            <Input
              id="days-occupied"
              readOnly
              tabIndex={-1}
              className="tabular h-10 bg-muted/50"
              value={`${result.daysOccupied} of ${result.daysInMonth}`}
            />
          </div>
        </div>

        <h3 className="mt-5 mb-1 text-sm font-semibold">A typical full month</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Estimates are fine. Each item starts from its usual or most recent amount; the split is your default
          from Setup.
        </p>
        <div className="flex flex-col divide-y">
          {items
            .filter((item) => item.enabled)
            .map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                <Label htmlFor={`estimate-${item.id}`} className="flex flex-col items-start gap-0.5 text-sm font-medium">
                  <span>
                    {item.label}
                    {item.kind !== "fixed" && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground italic">est.</span>
                    )}
                  </span>
                  {isOffset(item.coverage) && (
                    <span className="text-xs font-normal text-muted-foreground">
                      billed in arrears
                    </span>
                  )}
                </Label>
                <MoneyInput
                  id={`estimate-${item.id}`}
                  className="w-32"
                  value={record.estimates[item.id] ?? item.defaultAmountCents ?? null}
                  onCommit={(cents) => {
                    const estimates = { ...record.estimates }
                    if (cents === null) delete estimates[item.id]
                    else estimates[item.id] = cents
                    patch({ estimates })
                  }}
                />
              </div>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Label htmlFor="include-next" className="flex flex-col items-start gap-0.5">
            <span>Include the next full month</span>
            <span className="text-xs font-normal text-muted-foreground">One plan for both, instead of two bills back to back.</span>
          </Label>
          <Switch
            id="include-next"
            checked={record.includeNextMonth}
            onCheckedChange={(includeNextMonth) => patch({ includeNextMonth })}
          />
        </div>

        <Statements result={result} who={who} />

        {/* Both totals open onto the same bill item by item, so the estimate
            and what they actually owe can be read line against line. */}
        <div className="mt-3 overflow-hidden rounded-xl border text-sm">
          <div className="flex flex-col px-4 pt-1">
            <Row label="Full month total (for reference)" cents={result.fullMonthTotalCents} />
            <Breakdown
              className="py-2"
              label={`${who}'s share of a full month`}
              cents={result.fullShareCents}
              rows={result.fullMonthLines.map((line) => ({
                id: line.templateId,
                label: line.label,
                cents: line.shareCents,
                note: (
                  <>
                    of <Amount cents={line.fullCents} /> for the month
                  </>
                ),
              }))}
              empty="No line items are switched on in Setup."
            />
          </div>
          <Breakdown
            className="bg-accent px-4 py-3 text-accent-foreground"
            label="Combined to catch up"
            labelClassName="font-medium"
            cents={result.combinedCents}
            amountClassName="text-xl font-bold text-primary"
            testId="catchup-combined"
            rows={result.lines.map((line) => ({
              id: line.templateId,
              label: line.label,
              cents: line.shareCents,
            }))}
            empty="Nothing to catch up on yet."
          />
        </div>

        {offsetMonths > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <History className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Some bills pay for service up to {offsetMonths === 1 ? "a month" : `${offsetMonths} months`}{" "}
            earlier, so {who} isn&apos;t charged for the ones covering time before they arrived — and
            their share of the ones that straddle the move-in is prorated by the days they were here.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Smoothed catch-up plan"
        description={`Equal installments, evenly spaced between the two dates. ${who} sees this first, and can pick one of your usual schedules instead.`}
      >
        <div className="grid gap-3 min-[420px]:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catchup-start">First payment</Label>
            <DateField id="catchup-start" value={record.start} onChange={setDate("start")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catchup-end">Caught up by</Label>
            <DateField
              id="catchup-end"
              value={record.end}
              onChange={setDate("end")}
              min={record.start}
              // Share links only hold schedules that finish within a year of the move-in month.
              max={addDays(`${periodOf(record.moveIn)}-01`, 365)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Label>Number of installments</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Fewer installments"
              disabled={record.installments <= 1}
              onClick={() => patch({ installments: record.installments - 1 })}
            >
              <Minus />
            </Button>
            <span className="tabular w-6 text-center text-base font-semibold" aria-live="polite">
              {record.installments}
            </span>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="More installments"
              disabled={record.installments >= 12}
              onClick={() => patch({ installments: record.installments + 1 })}
            >
              <Plus />
            </Button>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="eyebrow pb-2 font-normal">Due</th>
              <th className="eyebrow pb-2 font-normal">Covers</th>
              <th className="eyebrow pb-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ownerPlan.payments.map((payment) => (
              <tr key={payment.date} className="border-b border-dashed last:border-0">
                <td className="tabular py-2.5">{formatLongDate(payment.date)}</td>
                <td className="py-2.5 text-muted-foreground">{payment.label}</td>
                <td className="py-2.5 text-right font-semibold">
                  <Amount cents={payment.amountCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        title="Once they've paid it off"
        description="Settling the catch-up hands its months back to the Month tab, so everything after it is billed the usual way."
      >
        <Button
          variant={settled ? "outline" : "default"}
          className="h-10 self-start"
          onClick={() =>
            settled ? actions.reopenCatchup(person.personId) : actions.closeCatchup(person.personId)
          }
        >
          <CheckCheck /> {settled ? "Reopen the catch-up" : "Mark the catch-up settled"}
        </Button>
      </SectionCard>

      <ShareCard
        key={`catchup:${person.personId}`}
        personId={person.personId}
        nickname={person.nickname}
        statement={{ kind: "catchup" }}
        period={periodOf(record.moveIn)}
        payload={payload}
        published={record.published}
        paid={record.paid}
      />
    </>
  )
}

/**
 * The catch-up, statement by statement. This is where offsets become legible:
 * the water bill that lands in the move-in month is for the month before it,
 * so it shows up at zero, and reappears — prorated — on the next statement.
 */
function Statements({ result, who }: { result: CatchupResult; who: string }) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      {result.statements.map((statement, index) => (
        <div key={statement.period} className="overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/50 px-4 py-2">
            <h4 className="text-sm font-semibold">
              {formatPeriod(statement.period)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {index === 0 ? "first statement" : "next statement"}
              </span>
            </h4>
            <span className="flex items-baseline gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                  statement.estimated ? "bg-warning-soft text-warning" : "bg-accent text-accent-foreground"
                }`}
              >
                {statement.estimated ? "estimate" : "actual bill"}
              </span>
              <Amount cents={statement.shareCents} className="font-semibold" />
            </span>
          </div>
          <div className="flex flex-col px-4 py-1">
            {statement.lines.map((line) => (
              <div
                key={line.templateId}
                className="flex items-start justify-between gap-4 border-b border-dashed py-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className={line.shareCents === 0 ? "text-muted-foreground" : ""}>{line.label}</p>
                  <p className="text-xs text-muted-foreground">
                    covers {formatWindow(line.covers)}
                    {line.occupancy === 0
                      ? ` — before ${who} moved in, so none of it theirs`
                      : line.occupancy < 1
                        ? ` — ${Math.round(line.occupancy * 100)}% of it theirs`
                        : ""}
                  </p>
                </div>
                <Amount
                  cents={line.shareCents}
                  className={line.shareCents === 0 ? "text-muted-foreground" : ""}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-2">
      <span className="min-w-0">{label}</span>
      <Amount cents={cents} />
    </div>
  )
}
