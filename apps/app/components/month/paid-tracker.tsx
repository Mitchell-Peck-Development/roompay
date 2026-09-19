"use client"

import {
  type PaidEntry,
  type Plan,
  type StatementRef,
  formatShortDate,
  paidProgress,
  todayISO,
} from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Check, Undo2 } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"
import { MoneyInput } from "@/components/common/money-input"
import { actions } from "@/lib/actions"

/**
 * Ticking off what's come in. Lives only on this device. Tracked as a running
 * total poured into the plan's rows, so partial payments and a roommate
 * changing plans mid-month don't scramble it.
 */
export function PaidTracker({
  plan,
  planNote,
  entries,
  statement,
  personId,
}: {
  plan: Plan
  planNote: string
  entries: PaidEntry[]
  statement: StatementRef
  personId: string
}) {
  const progress = paidProgress(plan, entries)
  const [custom, setCustom] = React.useState<number | null>(null)
  const owed = progress.paidCents + progress.remainingCents - progress.overpaidCents

  const add = (amountCents: number) =>
    actions.addPaid(statement, personId, { amountCents, date: todayISO() })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Payments received</h3>
        <p className="text-xs text-muted-foreground">
          {plan.name} · {planNote}
        </p>
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        {progress.rows.map((row) => (
          <li key={row.date} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border",
                  row.status === "paid" && "border-primary bg-primary text-primary-foreground",
                  row.status === "partial" && "border-warning bg-warning-soft"
                )}
              >
                {row.status === "paid" && <Check className="size-3" />}
              </span>
              <span className="text-sm">
                <span className="tabular">{formatShortDate(row.date)}</span>
                <span className="ml-2 text-muted-foreground">
                  <Amount cents={row.amountCents} />
                  {row.status === "partial" && (
                    <>
                      {" · "}
                      <Amount cents={row.paidCents} /> in
                    </>
                  )}
                </span>
              </span>
            </div>
            {row.status === "paid" ? (
              <span className="text-xs font-medium text-primary">Paid</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => add(row.amountCents - row.paidCents)}>
                Mark paid
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm">
        <Amount cents={progress.paidCents} className="font-semibold" /> of <Amount cents={owed} /> received
        {progress.remainingCents > 0 && (
          <span className="text-muted-foreground">
            {" · "}
            <Amount cents={progress.remainingCents} /> to go
          </span>
        )}
        {progress.overpaidCents > 0 && (
          <span className="text-warning">
            {" · "}
            <Amount cents={progress.overpaidCents} /> over
          </span>
        )}
      </p>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          A different amount
          <MoneyInput className="w-32" value={custom} onCommit={setCustom} aria-label="Payment amount" />
        </label>
        <Button
          variant="outline"
          className="h-10"
          disabled={!custom}
          onClick={() => {
            if (custom) add(custom)
            setCustom(null)
          }}
        >
          Add payment
        </Button>
      </div>

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="tabular">{formatShortDate(entry.date)}</span> — <Amount cents={entry.amountCents} />
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded underline decoration-dotted underline-offset-4 hover:text-foreground"
                onClick={() => actions.removePaid(statement, personId, entry.id)}
              >
                <Undo2 className="size-3" /> Undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
