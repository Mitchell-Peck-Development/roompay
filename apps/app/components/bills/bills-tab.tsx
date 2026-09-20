"use client"

import {
  type ComputedLine,
  type Period,
  computeMonth,
  coverageWindow,
  dateInPeriod,
  daysInMonth,
  formatMoney,
  formatPeriod,
  formatWindow,
  lineAmountCents,
  periodOf,
  todayISO,
} from "@workspace/core"
import { cn } from "@workspace/ui/lib/utils"
import { CalendarClock, History } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"
import { SectionCard } from "@/components/common/section-card"
import { BillPopover, coversOwnMonth } from "@/components/month/bill-popover"
import { MonthHeader } from "@/components/month/month-header"
import { useData } from "@/lib/store"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Monday-first index of the 1st, so the grid starts in the right column. */
function leadingBlanks(period: Period): number {
  const [y, m] = period.split("-").map(Number) as [number, number]
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
}

/**
 * The statement laid out as the calendar the owner actually lives with:
 * every bill on the day the money has to leave.
 *
 * A bill's due date is its own thing, independent of both the month it's
 * billed in and the service it covers — the sewer bill that arrives in
 * September is August's usage and isn't due until October. So the calendar
 * follows the due dates wherever they land, drawing a grid per month the
 * statement actually has payments in, rather than forcing them all into the
 * billed month.
 */
export function BillsTab() {
  const data = useData()
  const month = data.current
  const computed = React.useMemo(() => computeMonth(month), [month])
  const today = todayISO()

  const dated = computed.lines.filter((l) => l.line.dueDate)
  const undated = computed.lines.filter((l) => !l.line.dueDate)

  // One grid per month that has a payment in it, in date order; the billed
  // month is always drawn, even when everything on it is due later.
  const periods = [
    ...new Set([month.period, ...dated.map((l) => periodOf(l.line.dueDate!))]),
  ].sort()

  const entered = computed.lines.filter((l) => l.entered).length
  const offset = computed.lines.filter((l) => !coversOwnMonth(l.line, month.period))
  const later = dated.filter((l) => periodOf(l.line.dueDate!) !== month.period)

  return (
    <>
      <MonthHeader />

      <SectionCard
        title="Bills calendar"
        description={`What ${formatPeriod(month.period)}'s statement costs you, on the days it's actually due. Tap a bill to set its amount, its due date or the period it covers.`}
      >
        <div className="flex flex-col gap-5">
          {periods.map((period) => (
            <MonthGrid
              key={period}
              period={period}
              billedPeriod={month.period}
              lines={dated.filter((l) => periodOf(l.line.dueDate!) === period)}
              today={today}
              currency={data.household.currency}
            />
          ))}
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t pt-4 text-sm">
          <div>
            <dt className="eyebrow">Billed this month</dt>
            <dd>
              <Amount cents={computed.totalCents} className="text-lg font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Entered</dt>
            <dd className="tabular text-lg font-semibold">
              {entered} of {computed.lines.length}
            </dd>
          </div>
          {offset.length > 0 && (
            <div className="min-w-0">
              <dt className="eyebrow">Paying for earlier service</dt>
              <dd className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <History className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{offset.map((l) => l.line.label).join(", ")}</span>
              </dd>
            </div>
          )}
          {later.length > 0 && (
            <div className="min-w-0">
              <dt className="eyebrow">Not due until later</dt>
              <dd className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{later.map((l) => l.line.label).join(", ")}</span>
              </dd>
            </div>
          )}
        </dl>
      </SectionCard>

      {undated.length > 0 && (
        <SectionCard
          title="Not on the calendar"
          description="These bills have no due date yet, so they don't sit on a day. Give each one a date — it doesn't change who owes what, only when you pay it."
        >
          <div className="flex flex-wrap gap-2">
            {undated.map((line) => (
              <DayBill
                key={line.line.id}
                computed={line}
                period={month.period}
                currency={data.household.currency}
                className="w-32 rounded-lg border p-2"
              />
            ))}
          </div>
        </SectionCard>
      )}

      <p className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Meter readings, per-bill splits and each roommate&apos;s share live in the Month tab. How a
        bill usually falls due, and the period it covers, are set once per item in Setup and
        overridden here for a single month.
      </p>
    </>
  )
}

/** One month of the calendar, labelled when it isn't the month being billed. */
function MonthGrid({
  period,
  billedPeriod,
  lines,
  today,
  currency,
}: {
  period: Period
  billedPeriod: Period
  lines: ComputedLine[]
  today: string
  currency: string
}) {
  const byDay = new Map<number, ComputedLine[]>()
  for (const line of lines) {
    const day = Number(line.line.dueDate!.slice(8, 10))
    byDay.set(day, [...(byDay.get(day) ?? []), line])
  }
  const due = lines.reduce((total, l) => total + l.amountCents, 0)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {formatPeriod(period)}
          {period !== billedPeriod && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {period > billedPeriod ? "due after this statement" : "due before this statement"}
            </span>
          )}
        </h3>
        {lines.length > 0 && (
          <span className="text-xs text-muted-foreground">
            <Amount cents={due} className="font-medium text-foreground" /> due
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <div key={day} className="eyebrow pb-1 text-[0.625rem]">
            {day.slice(0, 1)}
            <span className="sr-only">{day}</span>
          </div>
        ))}
        {Array.from({ length: leadingBlanks(period) }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth(period) }, (_, i) => {
          const day = i + 1
          const date = dateInPeriod(period, day)
          const onThisDay = byDay.get(day) ?? []
          return (
            <div
              key={day}
              className={cn(
                "flex min-h-16 flex-col gap-0.5 rounded-lg border border-transparent p-1 text-left",
                onThisDay.length > 0 && "border-border bg-muted/40",
                date === today && "ring-2 ring-primary/60"
              )}
            >
              <span
                className={cn(
                  "tabular text-[0.625rem] text-muted-foreground",
                  date === today && "font-semibold text-primary"
                )}
              >
                {day}
              </span>
              {onThisDay.map((line) => (
                <DayBill
                  key={line.line.id}
                  computed={line}
                  period={billedPeriod}
                  currency={currency}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** One bill on its day: amount if entered, and a mark when it looks back. */
function DayBill({
  computed,
  period,
  currency,
  className,
}: {
  computed: ComputedLine
  /** The month being billed — what a coverage change is measured against. */
  period: Period
  currency: string
  className?: string
}) {
  const { line } = computed
  const offset = !coversOwnMonth(line, period)
  const amount = lineAmountCents(line)
  const covers = line.covers ?? coverageWindow(period)

  return (
    <BillPopover line={line} period={period}>
      <button
        type="button"
        className={cn(
          "flex w-full flex-col items-start rounded bg-card px-1 py-0.5 text-left text-[0.625rem] leading-tight shadow-sm hover:bg-accent",
          className
        )}
        title={`${line.label} · covers ${formatWindow(covers)}`}
      >
        <span className="flex w-full items-center gap-0.5">
          {offset && <History className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="truncate font-medium">{line.label || "Untitled"}</span>
        </span>
        <span className="tabular text-muted-foreground">
          {amount === null ? "—" : formatMoney(amount, currency).replace(/\.00$/, "")}
        </span>
      </button>
    </BillPopover>
  )
}
