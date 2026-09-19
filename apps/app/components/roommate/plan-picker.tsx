"use client"

import {
  type Plan,
  type StatementKind,
  formatMoney,
  formatShortDate,
  isGentle,
  largestPayment,
} from "@workspace/core"
import { cn } from "@workspace/ui/lib/utils"
import { Check } from "lucide-react"
import * as React from "react"
import { shareClient, shareErrorMessage } from "@/lib/share-client"
import { AddToCalendar } from "./add-to-calendar"

type Props = {
  origin: string
  token: string
  period: string
  kind: StatementKind
  plans: Plan[]
  initialPlan: string
  alreadyChosen: boolean
  shareCents: number
  currency: string
  title: string
  householdLabel: string
  pageUrl: string
}

/** The roommate chooses how to pay, then sends those dates to their calendar. */
export function PlanPicker(props: Props) {
  const { token, period, kind, plans, shareCents, currency } = props
  const [selected, setSelected] = React.useState(props.initialPlan)
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error">(
    props.alreadyChosen ? "saved" : "idle"
  )
  const [error, setError] = React.useState("")
  const plan = plans.find((p) => p.key === selected) ?? plans[0]!
  const single = plans.length === 1

  async function choose(key: string) {
    if (key === selected && state === "saved") return
    setSelected(key)
    setState("saving")
    const result = await shareClient.pick({ token, period, kind, plan: key })
    if (result.ok) setState("saved")
    else {
      setState("error")
      setError(shareErrorMessage(result.error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!single && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">How would you like to pay?</h2>
            <p className="text-sm text-muted-foreground">
              Pick whatever suits your paydays. Your choice is shared back so you&apos;re both on the same page.
            </p>
          </div>
          <div role="radiogroup" aria-label="Payment plan" className="flex flex-col gap-2.5">
            {plans.map((option) => {
              const active = option.key === selected
              const gentle = isGentle(option, shareCents)
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(option.key)}
                  className={cn(
                    "rounded-xl border bg-card p-3.5 text-left transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                    active && "border-primary ring-1 ring-primary"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          active && "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {active && <Check className="size-3" />}
                      </span>
                      <span className="text-sm font-semibold">{option.name}</span>
                    </span>
                    <span
                      className={cn(
                        "tabular rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                        gentle ? "bg-accent text-accent-foreground" : "bg-warning-soft text-warning"
                      )}
                    >
                      largest {formatMoney(largestPayment(option), currency)}
                    </span>
                  </span>
                  {option.description && (
                    <span className="mt-1 block pl-7 text-xs text-muted-foreground">{option.description}</span>
                  )}
                  <span className="mt-2.5 flex flex-wrap gap-2 pl-7">
                    {option.payments.map((payment) => (
                      <span key={payment.date} className="rounded-lg border bg-muted/50 px-2.5 py-1.5">
                        <span className="eyebrow block text-[0.625rem] leading-tight">{formatShortDate(payment.date)}</span>
                        <span className="tabular text-sm">{formatMoney(payment.amountCents, currency)}</span>
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="min-h-5 text-sm" aria-live="polite" data-testid="pick-feedback">
            {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
            {state === "saved" && <span className="text-primary">Got it — {plan.name}. That&apos;s been shared back.</span>}
            {state === "error" && <span className="text-destructive">{error}</span>}
          </p>
        </section>
      )}

      {single && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Payment schedule</h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {plan.payments.map((payment) => (
              <li key={payment.date} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="tabular">{formatShortDate(payment.date)}</span>
                  <span className="ml-2 text-muted-foreground">{payment.label}</span>
                </span>
                <span className="tabular font-semibold">{formatMoney(payment.amountCents, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Put the dates in your calendar</h2>
          <p className="text-sm text-muted-foreground">
            {single ? "Every payment above" : `${plan.name}: ${plan.payments.length} ${plan.payments.length === 1 ? "date" : "dates"}`}
            , with a reminder on the morning of each.
          </p>
        </div>
        <AddToCalendar
          origin={props.origin}
          token={token}
          period={period}
          kind={kind}
          plan={plan}
          title={props.title}
          householdLabel={props.householdLabel}
          currency={currency}
          pageUrl={props.pageUrl}
        />
      </section>
    </div>
  )
}
