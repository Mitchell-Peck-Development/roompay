"use client"

import { type ComputedMonth, OWNER } from "@workspace/core"
import { Amount } from "@/components/common/amount"

type PersonRef = { personId: string; nickname: string }

/** The ruled ledger: every line, the total, then who owes what. */
export function LedgerSummary({
  computed,
  people,
}: {
  computed: ComputedMonth
  people: PersonRef[]
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <dl className="flex flex-col px-4 pt-1 text-sm">
        {computed.lines.map((l) => (
          <div key={l.line.id} className="flex justify-between gap-4 border-b border-dashed py-2">
            <dt className="min-w-0 truncate">{l.line.label || "Untitled"}</dt>
            <dd>
              {l.entered ? (
                <Amount cents={l.amountCents} />
              ) : (
                <span className="text-muted-foreground italic">not entered</span>
              )}
            </dd>
          </div>
        ))}
        <div className="-mt-px flex justify-between gap-4 border-t-2 border-foreground py-3 text-base font-semibold">
          <dt>Total bill</dt>
          <dd data-testid="total-bill">
            <Amount cents={computed.totalCents} />
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col divide-y divide-primary/10 bg-accent text-accent-foreground">
        {people.map((p) => (
          <div key={p.personId} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="min-w-0 truncate text-sm font-medium">{p.nickname || "Roommate"}&apos;s share</dt>
            <dd data-testid={`share-${p.nickname}`}>
              <Amount cents={computed.totals[p.personId] ?? 0} className="text-xl font-bold text-primary" />
            </dd>
          </div>
        ))}
      </dl>
      <dl className="flex justify-between gap-4 px-4 py-2.5 text-sm text-muted-foreground">
        <dt>Your share</dt>
        <dd>
          <Amount cents={computed.totals[OWNER] ?? 0} />
        </dd>
      </dl>
    </div>
  )
}
