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
 * The month laid out as the calendar the owner actually lives with: every
 * bill sitting on the day it falls due, saying what service it pays for.
 * A bill dated the 30th that covers last month is the whole point — the
 * date is when you pay, the coverage is who owes it.
 */
export function BillsTab() {
  const data = useData()
  const month = data.current
  const computed = React.useMemo(() => computeMonth(month), [month])
  const today = todayISO()

  const byDay = new Map<number, ComputedLine[]>()
  const undated: ComputedLine[] = []
  for (const line of computed.lines) {
    if (!line.line.dueDate) {
      undated.push(line)
      continue
    }
    const day = Number(line.line.dueDate.slice(8, 10))
    byDay.set(day, [...(byDay.get(day) ?? []), line])
  }

  const days = daysInMonth(month.period)
  const entered = computed.lines.filter((l) => l.entered).length
  const offset = computed.lines.filter((l) => !coversOwnMonth(l.line, month.period))

  return (
    <>
      <MonthHeader />

      <SectionCard
        title="Bills calendar"
        description={`Every bill on the day it's due in ${formatPeriod(month.period)}. Tap one to enter the amount or change the period it covers.`}
      >
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <div key={day} className="eyebrow pb-1 text-[0.625rem]">
              {day.slice(0, 1)}
              <span className="sr-only">{day}</span>
            </div>
          ))}
          {Array.from({ length: leadingBlanks(month.period) }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const date = dateInPeriod(month.period, day)
            const lines = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={cn(
                  "flex min-h-16 flex-col gap-0.5 rounded-lg border border-transparent p-1 text-left",
                  lines.length > 0 && "border-border bg-muted/40",
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
                {lines.map((line) => (
                  <DayBill
                    key={line.line.id}
                    computed={line}
                    period={month.period}
                    currency={data.household.currency}
                  />
                ))}
              </div>
            )
          })}
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
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
                <span className="truncate">
                  {offset.map((l) => l.line.label).join(", ")}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </SectionCard>

      {undated.length > 0 && (
        <SectionCard
          title="Not on the calendar"
          description="These bills have no due date yet, so they don't sit on a day. Give each one a date — it doesn't change who owes what, only where it shows up."
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
        Meter readings, per-bill splits and each roommate&apos;s share live in the Month tab. The
        period a bill covers is set once per item in Setup, and overridden here for a single month.
      </p>
    </>
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
