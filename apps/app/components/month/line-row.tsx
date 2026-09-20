"use client"

import {
  type ComputedLine,
  type LineMeter,
  type Participant,
  type Period,
  formatShortDate,
  meterDetail,
  meterUsage,
  parseDecimal,
  residentDays,
  windowDays,
} from "@workspace/core"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { History, X } from "lucide-react"
import { Amount } from "@/components/common/amount"
import { MoneyInput } from "@/components/common/money-input"
import { actions } from "@/lib/actions"
import { currencySymbol } from "@/lib/format"
import { useData } from "@/lib/store"
import { BillPopover, coversLabel, coversOwnMonth } from "./bill-popover"
import { CreditPopover } from "./credit-popover"
import { LineSplitPopover } from "./line-split-popover"

/** Participants carry residency, which is what the proration note explains. */
type PersonRef = Participant

const KIND_HINT = {
  fixed: "usually fixed",
  variable: "from the statement",
  metered: "metered",
} as const

export function LineRow({
  computed,
  people,
  period,
}: {
  computed: ComputedLine
  people: PersonRef[]
  period: Period
}) {
  const { line } = computed
  const inputId = `line-${line.id}`
  const offset = !coversOwnMonth(line, period)
  const isCredit = Boolean(line.oneOff) && (line.amountCents ?? 0) < 0

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0">
      {/* Name and amount share a row; everything about the bill goes on its
          own row below, where it has the full width to wrap into. */}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="min-w-0 flex-1 truncate text-sm font-medium">
          {line.label || "Untitled"}
        </Label>
        <div className="flex shrink-0 items-center gap-1">
          {line.kind === "metered" && line.meter ? (
            computed.entered ? (
              <Amount cents={computed.amountCents} className="text-base font-semibold" />
            ) : (
              <span className="text-sm text-muted-foreground">enter usage</span>
            )
          ) : (
            <MoneyInput
              id={inputId}
              className="w-28 min-[380px]:w-32"
              value={line.amountCents}
              allowNegative={line.oneOff}
              onCommit={(cents) => actions.setLineAmount(line.id, cents)}
            />
          )}
          {line.oneOff && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${line.label}`}
              onClick={() => actions.removeLine(line.id)}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {line.oneOff ? (
          <Badge variant="secondary">{isCredit ? "credit" : "one-time"}</Badge>
        ) : (
          <span className="text-muted-foreground italic">{KIND_HINT[line.kind]}</span>
        )}
        <BillPopover line={line} period={period} amount={false}>
          <button
            type="button"
            // Says which bill it belongs to: on its own, "Covers August
            // 2026" tells a screen reader nothing about which line it is.
            aria-label={`Period and due date for ${line.label}`}
            className={`flex items-center gap-1 rounded underline decoration-dotted underline-offset-4 ${
              offset ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {offset && <History className="size-3 shrink-0" aria-hidden />}
            Covers {coversLabel(line, period)}
          </button>
        </BillPopover>
        {line.dueDate && (
          <span className="tabular text-muted-foreground">due {formatShortDate(line.dueDate)}</span>
        )}
        {people.length > 0 &&
          (isCredit ? (
            <CreditPopover
              lineId={line.id}
              split={line.split}
              people={people}
              onChange={(split) => actions.setLineSplit(line.id, split)}
            />
          ) : (
            <LineSplitPopover
              lineId={line.id}
              split={line.split}
              people={people}
              onChange={(split) => actions.setLineSplit(line.id, split)}
            />
          ))}
      </div>

      {line.kind === "metered" && line.meter && (
        <MeterFields lineId={line.id} inputId={inputId} meter={line.meter} />
      )}

      {computed.prorated && <ProrationNote computed={computed} people={people} />}
    </div>
  )
}

/**
 * Why someone's share isn't a clean fraction of the bill: they were only here
 * for part of what it covers. Spelling it out saves the argument.
 */
function ProrationNote({
  computed,
  people,
}: {
  computed: ComputedLine
  people: PersonRef[]
}) {
  const covers = computed.line.covers
  if (!covers) return null
  const total = windowDays(covers)
  const partial = people.filter((p) => (computed.occupancy[p.personId] ?? 1) < 1)
  if (partial.length === 0) return null

  return (
    <span className="text-xs text-muted-foreground">
      {partial.map((person, i) => {
        const days = residentDays(covers, person)
        return (
          <span key={person.personId}>
            {i > 0 && ", "}
            {person.nickname || "Someone"}:{" "}
            {days === 0 ? "none of it — not here yet" : `${days} of ${total} days`}
          </span>
        )
      })}
    </span>
  )
}

function MeterFields({
  lineId,
  inputId,
  meter,
}: {
  lineId: string
  inputId: string
  meter: LineMeter
}) {
  const currency = useData().household.currency
  const set = (patch: Partial<LineMeter>) => actions.setLineMeter(lineId, patch)
  const unit = meter.unit || "unit"
  const usage = meterUsage(meter)
  const backwards =
    meter.input === "readings" &&
    parseDecimal(meter.prev ?? "") !== null &&
    parseDecimal(meter.curr ?? "") !== null &&
    usage === null

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
      <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
        {meter.input === "usage" ? (
          <DecimalField
            id={inputId}
            label={`Used (${unit})`}
            value={meter.usage ?? ""}
            onChange={(usage) => set({ usage })}
            className="col-span-2"
          />
        ) : (
          <>
            <DecimalField label="Previous reading" value={meter.prev ?? ""} onChange={(prev) => set({ prev })} />
            <DecimalField
              id={inputId}
              label="Current reading"
              value={meter.curr ?? ""}
              invalid={backwards}
              onChange={(curr) => set({ curr })}
            />
          </>
        )}
        <DecimalField
          label={`Rate (${currencySymbol(currency)} per ${unit})`}
          value={meter.rate}
          onChange={(rate) => set({ rate })}
        />
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor={`${inputId}-base`}>
            Base fee
          </Label>
          <MoneyInput
            id={`${inputId}-base`}
            value={meter.baseFeeCents === 0 ? null : meter.baseFeeCents}
            onCommit={(cents) => set({ baseFeeCents: cents ?? 0 })}
          />
        </div>
      </div>
      <p className="tabular text-xs text-muted-foreground">
        {backwards
          ? "The current reading is lower than the previous one."
          : (meterDetail(meter, currency) ?? "Usage × rate, plus any base fee.")}
      </p>
    </div>
  )
}

function DecimalField({
  id,
  label,
  value,
  onChange,
  invalid,
  className,
}: {
  id?: string
  label: string
  value: string
  onChange(value: string): void
  invalid?: boolean
  className?: string
}) {
  const bad = invalid || (value.trim() !== "" && parseDecimal(value) === null)
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="tabular h-10 text-right"
        value={value}
        aria-invalid={bad || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
