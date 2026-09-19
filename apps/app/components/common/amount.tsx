"use client"

import { formatMoney } from "@workspace/core"
import { cn } from "@workspace/ui/lib/utils"
import { useData } from "@/lib/store"

/** A sum of money, in the household's currency and tabular numerals. */
export function Amount({
  cents,
  currency,
  className,
}: {
  cents: number
  currency?: string
  className?: string
}) {
  const household = useData().household.currency
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {formatMoney(cents, currency ?? household)}
    </span>
  )
}
