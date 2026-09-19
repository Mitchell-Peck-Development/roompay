import { Check } from "lucide-react"

/**
 * What the roommate gets: their share, a few ways to pay it, and the dates in
 * their own calendar. Mirrors the picker in the app, down to the radio marks.
 */
const PLANS = [
  { name: "Pay in full", note: "Due on the 1st.", dates: [["Sep 1", "837.00"]] },
  {
    name: "Split in two",
    note: "Half on the 1st, half on the 15th.",
    dates: [
      ["Sep 1", "418.50"],
      ["Sep 15", "418.50"],
    ],
    picked: true,
  },
  {
    name: "Weekly",
    note: "4 equal payments: 1st, 8th, 15th and 22nd.",
    dates: [
      ["Sep 1", "209.25"],
      ["Sep 8", "209.25"],
      ["Sep 15", "209.25"],
      ["Sep 22", "209.25"],
    ],
  },
]

/** The five the feed actually uses, in the order a payment moves through them. */
const STATUSES = [
  { status: "Future", when: "more than 3 days away", tone: "text-muted-foreground" },
  { status: "Pending", when: "due in 1–3 days", tone: "text-foreground" },
  { status: "Pay now", when: "due today", tone: "text-foreground" },
  { status: "Overdue", when: "past due and still short", tone: "text-destructive" },
  { status: "Paid", when: "covered by what you've received", tone: "text-primary" },
]

export function PlanPreview() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {PLANS.map((plan) => (
          <li
            key={plan.name}
            className={`rounded-xl border bg-card p-3 ${plan.picked ? "border-primary ring-1 ring-primary/30" : ""}`}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  plan.picked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                }`}
                aria-hidden
              >
                {plan.picked && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {plan.name}
                  {plan.picked && (
                    <span className="ml-2 text-xs font-normal text-primary">their pick</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{plan.note}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.dates.map(([date, amount]) => (
                    <span
                      key={date}
                      className="rounded-md bg-muted px-2 py-1 text-[0.6875rem] leading-tight"
                    >
                      <span className="eyebrow block text-[0.5625rem]">{date}</span>
                      <span className="tabular font-medium">${amount}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border bg-card/60 p-4">
        <p className="eyebrow mb-2">In their calendar, refreshed daily</p>
        <p className="tabular mb-3 text-sm">
          <span className="font-semibold text-destructive">Overdue</span>
          <span className="text-muted-foreground"> · Pay $418.50 · Unit 3012</span>
        </p>
        <dl className="flex flex-col gap-1 text-xs">
          {STATUSES.map(({ status, when, tone }) => (
            <div key={status} className="flex gap-2">
              <dt className={`w-16 shrink-0 font-medium ${tone}`}>{status}</dt>
              <dd className="text-muted-foreground">{when}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
