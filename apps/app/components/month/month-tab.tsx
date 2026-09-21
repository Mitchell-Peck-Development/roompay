"use client"

import { buildMonthlyPayload, buildPlans, computeMonth, coveredByCatchup } from "@workspace/core"
import * as React from "react"
import { RoommateSwitcher } from "@/components/common/roommate-switcher"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"
import { AddLineDialog } from "./add-line-dialog"
import { CoveredByCatchup } from "./covered-by-catchup"
import { LedgerSummary } from "./ledger-summary"
import { LineRow } from "./line-row"
import { MonthHeader } from "./month-header"
import { PlanCards } from "./plan-cards"
import { ShareCard } from "./share-card"
import { SplitEditor } from "./split-editor"

export function MonthTab({ onOpenCatchup }: { onOpenCatchup?: () => void }) {
  const data = useData()
  const month = data.current
  const people = month.participants
  const computed = React.useMemo(() => computeMonth(month), [month])

  const [selected, setSelected] = React.useState(people[0]?.personId ?? "")
  const person = people.find((p) => p.personId === selected) ?? people[0]

  const shareCents = person ? (computed.totals[person.personId] ?? 0) : 0
  // While a catch-up settles this month for them, it does the billing.
  const covered = person ? coveredByCatchup(data, person.personId, month.period) : false
  const plans = React.useMemo(
    () => buildPlans(shareCents, data.cadences, month.period),
    [shareCents, data.cadences, month.period]
  )
  const payload = React.useMemo(
    () =>
      person && shareCents > 0 && !covered
        ? buildMonthlyPayload({
            month,
            personId: person.personId,
            cadences: data.cadences,
            currency: data.household.currency,
          })
        : null,
    [month, person, shareCents, covered, data.cadences, data.household.currency]
  )

  return (
    <>
      <MonthHeader />

      <SectionCard
        title="This month's bill"
        description="Fixed charges are prefilled from Setup, and a new amount for one becomes what later months start from. The rest come off the statement, month by month."
      >
        <div className="flex flex-col divide-y">
          {computed.lines.map((line) => (
            <LineRow key={line.line.id} computed={line} people={people} period={month.period} />
          ))}
          {computed.lines.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">
              No line items yet — add some in Setup, or add a one-time item below.
            </p>
          )}
        </div>
        <div className="mt-3 flex">
          <AddLineDialog people={people} />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">How it&apos;s split</h3>
            {JSON.stringify(month.split) !== JSON.stringify(data.split) && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
                onClick={() => actions.setDefaultSplit(month.split)}
              >
                Use this split for new months
              </button>
            )}
          </div>
          <SplitEditor split={month.split} people={people} onChange={actions.setMonthSplit} />
        </div>

        <div className="mt-6">
          <LedgerSummary computed={computed} people={people} />
        </div>
      </SectionCard>

      {person ? (
        <>
          <RoommateSwitcher people={people} value={person.personId} onChange={setSelected} />

          {covered ? (
            <CoveredByCatchup
              nickname={person.nickname}
              period={month.period}
              shareCents={shareCents}
              currency={data.household.currency}
              onOpenCatchup={onOpenCatchup}
            />
          ) : (
            <>
              <SectionCard
                title="Payment options"
                description={`Ways for ${person.nickname || "your roommate"} to pay across the month instead of one lump sum.`}
              >
                <PlanCards plans={plans} shareCents={shareCents} />
              </SectionCard>

              <ShareCard
                key={`${month.id}:${person.personId}`}
                personId={person.personId}
                nickname={person.nickname}
                statement={{ kind: "monthly", monthId: month.id }}
                period={month.period}
                payload={payload}
                published={month.published[person.personId]}
                paid={month.paid[person.personId] ?? []}
                beforePublish={actions.saveCurrent}
              />
            </>
          )}
        </>
      ) : (
        <SectionCard title="Nobody to split with" description="Add a roommate in Setup to see their share and payment options.">
          <span />
        </SectionCard>
      )}
    </>
  )
}
