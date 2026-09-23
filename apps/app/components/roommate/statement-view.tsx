import { formatMoney, formatPeriod, formatShortDate, lastDueOn, nextPeriod } from "@workspace/core"
import Link from "next/link"
import { Fragment } from "react"
import { pageUrl } from "@/lib/server/rp/feed"
import type { LinkView, StatementView as Statement } from "@/lib/server/rp/service"
import { PlanPicker } from "./plan-picker"
import { RememberLink } from "./remember-link"

/** What a roommate sees when they open their link. Rendered on the server. */
export function StatementView({
  view,
  statement,
  token,
  origin,
}: {
  view: LinkView
  statement: Statement
  token: string
  origin: string
}) {
  const { payload } = statement
  const money = (cents: number) => formatMoney(cents, payload.currency)
  const initialPlan =
    [statement.chosenPlan, view.link.preferredPlan, payload.defaultPlan].find(
      (key) => key && payload.plans.some((p) => p.key === key)
    ) ?? payload.plans[0]!.key
  const groups = groupByStatement(payload.lines)
  const lastPeriod = payload.catchup?.periods?.at(-1)
  const later = payload.catchup?.later ?? []
  const laterNote =
    lastPeriod && later.length > 0
      ? `${formatPeriod(lastPeriod).split(" ")[0]}'s ${listOf(later)} ${later.length === 1 ? "arrives" : "arrive"} a month behind, so ${later.length === 1 ? "it isn't" : "they aren't"} here — ${later.length === 1 ? "it'll" : "they'll"} be on your ${formatPeriod(nextPeriod(lastPeriod))} statement.`
      : null
  const others = view.statements.filter((s) => !(s.period === statement.period && s.kind === statement.kind))

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16">
      <RememberLink
        token={token}
        householdLabel={view.link.householdLabel}
        roommateLabel={view.link.roommateLabel}
      />

      <header className="mb-5">
        <p className="eyebrow">{view.link.householdLabel || "RoomPay"}</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{payload.title}</h1>
        {view.link.roommateLabel && (
          <p className="text-sm text-muted-foreground">For {view.link.roommateLabel}</p>
        )}
      </header>

      <div className="flex flex-col gap-6">
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="bg-accent px-5 py-4 text-accent-foreground">
            <p className="text-sm font-medium">Your share</p>
            <p className="tabular text-4xl font-bold text-primary" data-testid="roommate-share">
              {money(payload.shareCents)}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {payload.kind === "catchup"
                ? `Due by ${formatShortDate(lastDueOn(payload))}`
                : `of a ${money(payload.totalCents)} bill for ${formatPeriod(payload.period)}`}
            </p>
            {statement.receivedCents > 0 && (
              <p className="mt-2 text-sm font-medium" data-testid="received">
                {statement.receivedCents >= payload.shareCents
                  ? "All paid — thank you."
                  : `${money(statement.receivedCents)} received so far · ${money(payload.shareCents - statement.receivedCents)} to go`}
              </p>
            )}
          </div>

          {payload.catchup && (
            <dl className="flex flex-col border-b px-5 py-2 text-sm">
              <div className="flex justify-between gap-4 py-1.5">
                <dt className="text-muted-foreground">
                  Moved in {formatShortDate(payload.catchup.moveIn)} — {payload.catchup.daysOccupied} of{" "}
                  {payload.catchup.daysInMonth} days
                </dt>
                <dd className="tabular">{money(payload.catchup.stubShareCents)}</dd>
              </div>
              {payload.catchup.nextMonthShareCents > 0 && (
                <div className="flex justify-between gap-4 py-1.5">
                  <dt className="text-muted-foreground">Plus the next full month</dt>
                  <dd className="tabular">{money(payload.catchup.nextMonthShareCents)}</dd>
                </div>
              )}
            </dl>
          )}

          {payload.lines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="eyebrow px-5 py-2 text-left font-normal">
                    {payload.kind === "catchup" ? "Bills so far" : "Bill"}
                  </th>
                  <th className="eyebrow py-2 text-right font-normal">Total</th>
                  <th className="eyebrow px-5 py-2 text-right font-normal">Yours</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.billedIn ?? "all"}>
                    {group.billedIn && groups.length > 1 && (
                      <tr className="border-b bg-muted/40">
                        <th colSpan={2} scope="rowgroup" className="px-5 py-1.5 text-left text-xs font-medium">
                          Billed in {formatPeriod(group.billedIn).split(" ")[0]}
                        </th>
                        <td className="tabular px-5 py-1.5 text-right text-xs font-medium">
                          {money(group.lines.reduce((sum, l) => sum + l.shareCents, 0))}
                        </td>
                      </tr>
                    )}
                    {group.lines.map((line, i) => (
                      <tr key={`${line.label}-${i}`} className="border-b border-dashed last:border-0">
                        <td className="px-5 py-2.5 align-top">
                          {line.label}
                          {line.covers && (
                            <span className="block text-xs text-muted-foreground">
                              covers {line.covers}
                            </span>
                          )}
                          {line.detail && <span className="tabular block text-xs text-muted-foreground">{line.detail}</span>}
                          {line.prorated && (
                            <span className="block text-xs text-muted-foreground">
                              {line.prorated.days === 0
                                ? "none of it yours — before you moved in"
                                : `your ${line.prorated.days} of ${line.prorated.of} days`}
                            </span>
                          )}
                        </td>
                        <td className="tabular py-2.5 text-right align-top text-muted-foreground">{money(line.totalCents)}</td>
                        <td className="tabular px-5 py-2.5 text-right align-top font-medium">{money(line.shareCents)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          {laterNote && (
            <p className="border-t px-5 py-3 text-xs text-muted-foreground" data-testid="catchup-later">
              {laterNote}
            </p>
          )}
        </section>

        <PlanPicker
          origin={origin}
          token={token}
          period={statement.period}
          kind={statement.kind}
          plans={payload.plans}
          initialPlan={initialPlan}
          alreadyChosen={statement.chosenPlan !== null}
          shareCents={payload.shareCents}
          receivedCents={statement.receivedCents}
          currency={payload.currency}
          title={payload.title}
          householdLabel={view.link.householdLabel}
          pageUrl={pageUrl(origin, token, statement)}
        />

        {others.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Other statements on this link</h2>
            <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {others.map((s) => (
                <li key={`${s.period}-${s.kind}`}>
                  <Link
                    href={`/r/${token}/${s.period}${s.kind === "catchup" ? "?kind=catchup" : ""}`}
                    className="flex justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span>{s.payload.title}</span>
                    <span className="tabular text-muted-foreground">{money(s.payload.shareCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">What is this?</summary>
          <p className="mt-2 leading-relaxed">
            Someone you live with uses RoomPay to split the bills, and sent you this link with your share. It
            only shows numbers and the labels they chose — no names, no account, and no payment details.
            RoomPay doesn&apos;t move money; pay them however you usually do.
          </p>
          <p className="mt-2 leading-relaxed">
            This link stops working about two months after its last due date, or sooner if they remove it.{" "}
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              Split your own bills with RoomPay
            </Link>
            .
          </p>
        </details>
      </div>
    </div>
  )
}

type Line = Statement["payload"]["lines"][number]

/** A catch-up's lines, split by the statement each lands on; anything else stays one group. */
function groupByStatement(lines: Line[]): { billedIn?: string; lines: Line[] }[] {
  const groups: { billedIn?: string; lines: Line[] }[] = []
  for (const line of lines) {
    const group = groups.at(-1)
    if (group && group.billedIn === line.billedIn) group.lines.push(line)
    else groups.push({ billedIn: line.billedIn, lines: [line] })
  }
  return groups
}

function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}
