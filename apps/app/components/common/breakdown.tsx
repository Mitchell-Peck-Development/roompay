"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronRight } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"

export type BreakdownRow = {
  id: string
  label: string
  cents: number
  /** A word about why this row is what it is — prorated, excluded, and so on. */
  note?: React.ReactNode
}

/**
 * A total that opens to show what it's made of: one roommate's share of each
 * line item, adding up to the figure on the row itself.
 */
export function Breakdown({
  label,
  cents,
  rows,
  amountClassName,
  labelClassName,
  className,
  testId,
  empty = "Nothing on this bill yet.",
}: {
  label: React.ReactNode
  cents: number
  rows: BreakdownRow[]
  amountClassName?: string
  labelClassName?: string
  className?: string
  testId?: string
  empty?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="flex w-full items-baseline justify-between gap-4 text-left">
        <span className={cn("flex min-w-0 items-baseline gap-1.5", labelClassName)}>
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 translate-y-0.5 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
            aria-hidden
          />
          <span className="min-w-0 truncate">{label}</span>
        </span>
        <span data-testid={testId}>
          <Amount cents={cents} className={amountClassName} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-1 mb-1 flex flex-col pl-5">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 border-b border-dashed py-1.5 text-sm last:border-0"
            >
              <dt className={cn("min-w-0", row.cents === 0 && "text-muted-foreground")}>
                <span className="block truncate">{row.label || "Untitled"}</span>
                {row.note ? (
                  <span className="block text-xs text-muted-foreground">{row.note}</span>
                ) : null}
              </dt>
              <dd className={cn(row.cents === 0 && "text-muted-foreground")}>
                <Amount cents={row.cents} />
              </dd>
            </div>
          ))}
          {rows.length === 0 && <p className="py-1.5 text-sm text-muted-foreground">{empty}</p>}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}
