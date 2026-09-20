"use client"

import { type Period, formatPeriod, formatMoney } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { CalendarRange } from "lucide-react"
import { SectionCard } from "@/components/common/section-card"

/**
 * A month that a roommate's catch-up already settles. Their share still shows
 * in the ledger — it's part of the bill — but it's billed once, through the
 * catch-up, so they're never asked for the same month twice.
 */
export function CoveredByCatchup({
  nickname,
  period,
  shareCents,
  currency,
  onOpenCatchup,
}: {
  nickname: string
  period: Period
  shareCents: number
  currency: string
  onOpenCatchup(): void
}) {
  const who = nickname || "your roommate"
  return (
    <SectionCard
      title={`${who}'s catch-up covers this month`}
      description={`${formatPeriod(period)} is part of their settling-in plan, so it isn't billed separately — they see one plan with one set of dates.`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Their share of this month, <strong className="tabular">{formatMoney(shareCents, currency)}</strong>, is
          counted in that plan. Now that this month is entered, the plan bills the real figure instead of the
          estimate.
        </p>
        <Button variant="outline" className="h-10 self-start" onClick={onOpenCatchup}>
          <CalendarRange /> Open the catch-up
        </Button>
      </div>
    </SectionCard>
  )
}
