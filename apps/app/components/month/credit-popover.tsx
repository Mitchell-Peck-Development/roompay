"use client"

import type { ItemSplit } from "@workspace/core"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { CreditFields, describeCredit } from "./credit-editor"

type PersonRef = { personId: string; nickname: string }

/** Where a credit lands, editable from the line it sits on. */
export function CreditPopover({
  lineId,
  split,
  people,
  onChange,
}: {
  lineId: string
  split: ItemSplit
  people: PersonRef[]
  onChange(split: ItemSplit): void
}) {
  return (
    <Popover>
      <PopoverTrigger className="rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        {describeCredit(split, people)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-1 text-sm font-medium">Where does this credit come off?</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Before the split it lowers the bill for everyone. After it, it comes straight off the shares you pick.
        </p>
        <CreditFields split={split} people={people} onChange={onChange} idPrefix={`credit-${lineId}`} />
      </PopoverContent>
    </Popover>
  )
}
