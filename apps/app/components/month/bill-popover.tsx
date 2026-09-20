"use client"

import {
  type MonthLine,
  type Period,
  type ServiceWindow,
  coverageOf,
  coverageWindow,
  formatPeriod,
  formatWindow,
  lineAmountCents,
  meterDetail,
  periodOf,
} from "@workspace/core"
import { DateField } from "@/components/common/date-field"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { CalendarClock, History } from "lucide-react"
import type * as React from "react"
import { Amount } from "@/components/common/amount"
import { MoneyInput } from "@/components/common/money-input"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

const PRESETS = [
  { months: 0, label: "This month" },
  { months: 1, label: "Last month" },
  { months: 2, label: "2 back" },
] as const

/** True when a line's window is exactly the month it's billed in. */
export function coversOwnMonth(line: MonthLine, period: Period): boolean {
  if (!line.covers) return true
  const own = coverageWindow(period)
  return line.covers.start === own.start && line.covers.end === own.end
}

/** "August 2026" — what this line is actually paying for. */
export function coversLabel(line: MonthLine, period: Period): string {
  return formatWindow(line.covers ?? coverageWindow(period))
}

/**
 * Everything about one bill in one place: what it came to, when it's due,
 * and — the part that decides who owes it — the stretch of service it pays
 * for. A bill dated the 30th that covers last month is normal: the date is
 * when the money leaves, the coverage is whose money it is.
 */
export function BillPopover({
  line,
  period,
  children,
  amount = true,
}: {
  line: MonthLine
  period: Period
  children: React.ReactNode
  /** False in the month list, where the amount is already an input in the row. */
  amount?: boolean
}) {
  const currency = useData().household.currency
  const covers = line.covers ?? coverageWindow(period)
  const preset = coverageOf(period, covers)
  const selected =
    preset?.spanMonths === 1 && preset.offsetMonths <= 2 ? String(preset.offsetMonths) : ""
  const dueElsewhere = Boolean(line.dueDate && periodOf(line.dueDate) !== period)

  const setDate = (key: keyof ServiceWindow) => (value: string | null) => {
    if (value) actions.setLineCoverage(line.id, { ...covers, [key]: value })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <p className="text-sm font-medium">{line.label || "Untitled"}</p>

        {amount && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`bill-amount-${line.id}`} className="text-xs text-muted-foreground">
              Amount
            </Label>
            {line.kind === "metered" && line.meter ? (
              <div className="text-right">
                <Amount cents={lineAmountCents(line) ?? 0} className="text-sm font-semibold" />
                <p className="text-[0.625rem] text-muted-foreground">
                  {meterDetail(line.meter, currency) ?? "Enter the usage in Month"}
                </p>
              </div>
            ) : (
              <MoneyInput
                id={`bill-amount-${line.id}`}
                className="w-32"
                value={line.amountCents}
                allowNegative={line.oneOff}
                onCommit={(cents) => actions.setLineAmount(line.id, cents)}
              />
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium">What period does it cover?</Label>
            <p className="text-xs text-muted-foreground">
              Roommates only owe a share of the days they were here for.
            </p>
          </div>

          <ToggleGroup
            type="single"
            variant="outline"
            value={selected}
            onValueChange={(value) =>
              value &&
              actions.setLineCoverage(
                line.id,
                coverageWindow(period, { offsetMonths: Number(value), spanMonths: 1 })
              )
            }
            className="w-full"
          >
            {PRESETS.map((option) => (
              <ToggleGroupItem
                key={option.months}
                value={String(option.months)}
                className="h-9 flex-1 text-xs"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="grid gap-2 min-[380px]:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`covers-start-${line.id}`} className="text-xs text-muted-foreground">
                From
              </Label>
              <DateField id={`covers-start-${line.id}`} value={covers.start} onChange={setDate("start")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`covers-end-${line.id}`} className="text-xs text-muted-foreground">
                To
              </Label>
              <DateField
                id={`covers-end-${line.id}`}
                value={covers.end}
                min={covers.start}
                onChange={setDate("end")}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t pt-3">
          <Label htmlFor={`due-${line.id}`} className="text-sm font-medium">
            When is it due?
          </Label>
          <p className="text-xs text-muted-foreground">
            Any date — a bill billed now can fall due next month.
          </p>
          <DateField
            id={`due-${line.id}`}
            className="mt-1"
            value={line.dueDate ?? ""}
            clearable
            onChange={(value) => actions.setLineDueDate(line.id, value)}
          />
          {dueElsewhere && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Due in {formatPeriod(periodOf(line.dueDate!))}, so it sits on that month&apos;s grid.
              Later statements will keep the same gap.
            </p>
          )}
        </div>

        <p className="flex items-start gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <History className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Covers {formatWindow(covers)}. Both of these repeat every month once you set them in
          Setup → Line items.
        </p>
      </PopoverContent>
    </Popover>
  )
}
