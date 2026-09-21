"use client"

import { type ComputedMonth, OWNER } from "@workspace/core"
import { Amount } from "@/components/common/amount"
import { Breakdown, type BreakdownRow } from "@/components/common/breakdown"

type PersonRef = { personId: string; nickname: string }

/** The ruled ledger: every line, the total, then who owes what. */
export function LedgerSummary({
  computed,
  people,
}: {
  computed: ComputedMonth
  people: PersonRef[]
}) {
  // One person's share of every line, which is what their total is made of.
  const rowsFor = (key: string): BreakdownRow[] =>
    computed.lines.map((l) => {
      const fraction = l.occupancy[key]
      return {
        id: l.line.id,
        label: l.line.label,
        cents: l.shares[key] ?? 0,
        ...(fraction !== undefined && fraction < 1
          ? { note: `here for ${Math.round(fraction * 100)}% of what it covers` }
          : {}),
      }
    })

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

      {/* Each share opens onto the same bill seen from that roommate's side:
          their part of every line, adding up to what they're asked for. */}
      <div className="flex flex-col divide-y divide-primary/10 bg-accent text-accent-foreground">
        {people.map((p) => (
          <Breakdown
            key={p.personId}
            className="px-4 py-3"
            label={`${p.nickname || "Roommate"}'s share`}
            labelClassName="text-sm font-medium"
            cents={computed.totals[p.personId] ?? 0}
            amountClassName="text-xl font-bold text-primary"
            testId={`share-${p.nickname}`}
            rows={rowsFor(p.personId)}
          />
        ))}
      </div>
      <Breakdown
        className="px-4 py-2.5 text-sm text-muted-foreground"
        label="Your share"
        cents={computed.totals[OWNER] ?? 0}
        rows={rowsFor(OWNER)}
      />
    </div>
  )
}
