"use client"

import {
  buildCatchupPayload,
  computeCatchup,
  formatLongDate,
  isISODate,
  itemsWithRecentDefaults,
  periodOf,
  todayISO,
} from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Minus, Plus } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"
import { MoneyInput } from "@/components/common/money-input"
import { RoommateSwitcher } from "@/components/common/roommate-switcher"
import { SectionCard } from "@/components/common/section-card"
import { ShareCard } from "@/components/month/share-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

/**
 * For a roommate who moves in mid-month: prorate the partial month, add the
 * next full one, and spread the lot over even installments so nothing lands
 * as one oversized payment.
 */
export function CatchupTab() {
  const data = useData()
  const people = data.people
    .filter((p) => !p.archived)
    .map((p) => ({ personId: p.id, nickname: p.nickname }))
  const [selected, setSelected] = React.useState(people[0]?.personId ?? "")
  const person = people.find((p) => p.personId === selected) ?? people[0]
  const record = person ? data.catchups[person.personId] : undefined

  React.useEffect(() => {
    if (person && !record) actions.ensureCatchup(person.personId, todayISO())
  }, [person, record])

  // Bills that vary start from whatever was last entered for them.
  const items = React.useMemo(() => itemsWithRecentDefaults(data), [data])
  const result = React.useMemo(
    () => (record ? computeCatchup({ record, items, split: data.split, people: data.people }) : null),
    [record, items, data.split, data.people]
  )

  if (!person) {
    return (
      <SectionCard title="Move-in catch-up" description="Add a roommate in Setup first.">
        <span />
      </SectionCard>
    )
  }
  if (!record || !result) return null

  const who = person.nickname || "your roommate"
  const patch = (next: Parameters<typeof actions.patchCatchup>[1]) => actions.patchCatchup(person.personId, next)
  const setDate = (key: "moveIn" | "start" | "end") => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isISODate(e.target.value)) patch({ [key]: e.target.value })
  }
  const payload =
    result.combinedCents > 0
      ? buildCatchupPayload({ result, record, currency: data.household.currency })
      : null

  return (
    <>
      <RoommateSwitcher people={people} value={person.personId} onChange={setSelected} />

      <SectionCard
        title="Move-in stub period"
        description="Prorates the partial first month by days occupied, then adds the following full month — so you can quote one smoothed plan instead of a small charge now and a big one right after."
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-in">Move-in date</Label>
            <Input id="move-in" type="date" className="tabular h-10" value={record.moveIn} onChange={setDate("moveIn")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="days-occupied">Days occupied that month</Label>
            <Input
              id="days-occupied"
              readOnly
              tabIndex={-1}
              className="tabular h-10 bg-muted/50"
              value={`${result.daysOccupied} of ${result.daysInMonth}`}
            />
          </div>
        </div>

        <h3 className="mt-5 mb-1 text-sm font-semibold">A typical full month</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Estimates are fine. Each item starts from its usual or most recent amount; the split is your default
          from Setup.
        </p>
        <div className="flex flex-col divide-y">
          {items
            .filter((item) => item.enabled)
            .map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                <Label htmlFor={`estimate-${item.id}`} className="text-sm font-medium">
                  {item.label}
                  {item.kind !== "fixed" && <span className="ml-2 text-xs font-normal text-muted-foreground italic">est.</span>}
                </Label>
                <MoneyInput
                  id={`estimate-${item.id}`}
                  className="w-32"
                  value={record.estimates[item.id] ?? item.defaultAmountCents ?? null}
                  onCommit={(cents) => {
                    const estimates = { ...record.estimates }
                    if (cents === null) delete estimates[item.id]
                    else estimates[item.id] = cents
                    patch({ estimates })
                  }}
                />
              </div>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Label htmlFor="include-next" className="flex flex-col items-start gap-0.5">
            <span>Include the next full month</span>
            <span className="text-xs font-normal text-muted-foreground">One plan for both, instead of two bills back to back.</span>
          </Label>
          <Switch
            id="include-next"
            checked={record.includeNextMonth}
            onCheckedChange={(includeNextMonth) => patch({ includeNextMonth })}
          />
        </div>

        <dl className="mt-5 overflow-hidden rounded-xl border text-sm">
          <div className="flex flex-col px-4 pt-1">
            <Row label="Full month total (for reference)" cents={result.fullMonthTotalCents} />
            <Row label={`${who}'s share of a full month`} cents={result.fullShareCents} />
            <Row label={`Prorated for ${result.daysOccupied} of ${result.daysInMonth} days`} cents={result.stubShareCents} />
            {record.includeNextMonth && <Row label="+ the next full month (est.)" cents={result.nextMonthShareCents} />}
          </div>
          <div className="flex items-baseline justify-between gap-4 bg-accent px-4 py-3 text-accent-foreground">
            <dt className="font-medium">Combined to catch up</dt>
            <dd data-testid="catchup-combined">
              <Amount cents={result.combinedCents} className="text-xl font-bold text-primary" />
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard
        title="Smoothed catch-up plan"
        description="Equal installments, evenly spaced between the two dates."
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catchup-start">First payment</Label>
            <Input id="catchup-start" type="date" className="tabular h-10" value={record.start} onChange={setDate("start")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catchup-end">Caught up by</Label>
            <Input id="catchup-end" type="date" className="tabular h-10" min={record.start} value={record.end} onChange={setDate("end")} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Label>Number of installments</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Fewer installments"
              disabled={record.installments <= 1}
              onClick={() => patch({ installments: record.installments - 1 })}
            >
              <Minus />
            </Button>
            <span className="tabular w-6 text-center text-base font-semibold" aria-live="polite">
              {record.installments}
            </span>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="More installments"
              disabled={record.installments >= 12}
              onClick={() => patch({ installments: record.installments + 1 })}
            >
              <Plus />
            </Button>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="eyebrow pb-2 font-normal">Due</th>
              <th className="eyebrow pb-2 font-normal">Covers</th>
              <th className="eyebrow pb-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {result.plan.payments.map((payment) => (
              <tr key={payment.date} className="border-b border-dashed last:border-0">
                <td className="tabular py-2.5">{formatLongDate(payment.date)}</td>
                <td className="py-2.5 text-muted-foreground">{payment.label}</td>
                <td className="py-2.5 text-right font-semibold">
                  <Amount cents={payment.amountCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <ShareCard
        key={`catchup:${person.personId}`}
        personId={person.personId}
        nickname={person.nickname}
        statement={{ kind: "catchup" }}
        period={periodOf(record.moveIn)}
        payload={payload}
        published={record.published}
        paid={record.paid}
      />
    </>
  )
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-2 last:border-0">
      <dt className="min-w-0">{label}</dt>
      <dd>
        <Amount cents={cents} />
      </dd>
    </div>
  )
}
