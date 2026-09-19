"use client"

import { type Plan, formatShortDate, isGentle, largestPayment } from "@workspace/core"
import { cn } from "@workspace/ui/lib/utils"
import { Amount } from "@/components/common/amount"

/** The payment options for one share, with each plan's heaviest payment flagged. */
export function PlanCards({
  plans,
  shareCents,
  currency,
  highlightKey,
  highlightLabel,
}: {
  plans: Plan[]
  shareCents: number
  currency?: string
  highlightKey?: string | null
  highlightLabel?: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {plans.map((plan) => {
        const gentle = isGentle(plan, shareCents)
        const picked = plan.key === highlightKey
        return (
          <div
            key={plan.key}
            className={cn("rounded-xl border p-3.5", picked && "border-primary ring-1 ring-primary")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {plan.name}
                {picked && highlightLabel ? (
                  <span className="ml-2 text-xs font-medium text-primary">{highlightLabel}</span>
                ) : null}
              </p>
              <span
                className={cn(
                  "tabular rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                  gentle
                    ? "bg-accent text-accent-foreground"
                    : "bg-warning-soft text-warning dark:text-warning"
                )}
              >
                largest payment <Amount cents={largestPayment(plan)} currency={currency} />
              </span>
            </div>
            {plan.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>
            ) : null}
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {plan.payments.map((payment) => (
                <li key={payment.date} className="rounded-lg border bg-muted/50 px-2.5 py-1.5">
                  <span className="eyebrow block text-[0.625rem] leading-tight">
                    {formatShortDate(payment.date)}
                  </span>
                  <Amount cents={payment.amountCents} currency={currency} className="text-sm" />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
