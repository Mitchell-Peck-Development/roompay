import { Button } from "@workspace/ui/components/button"
import {
  CalendarClock,
  CalendarPlus,
  Gauge,
  History,
  Link2,
  ListPlus,
  Percent,
  Send,
  ShieldCheck,
  Smartphone,
  UserRoundPlus,
} from "lucide-react"
import { Band, Heading } from "@/components/landing/section"
import { PlanPreview } from "@/components/landing/plan-preview"
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome"
import { StatementPreview } from "@/components/landing/statement-preview"
import { TimingDiagram } from "@/components/landing/timing-diagram"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"

const STEPS = [
  {
    icon: ListPlus,
    title: "Set up your bills once",
    body: "Rent, the service fee, gas by the therm, a parking spot. For each one, say what period it covers and when it falls due — most utilities bill a month behind, and RoomPay starts them that way.",
  },
  {
    icon: Gauge,
    title: "Fill in the month",
    body: "Fixed charges are already there. Type in the ones that change, or a meter reading and a rate. The calendar shows each bill on the day it's actually due.",
  },
  {
    icon: Send,
    title: "Send each roommate a link",
    body: "One link each, and it lasts. Every month you publish goes into the same link, with their share, the ways they can pay it, and the dates.",
  },
]

const FAIRNESS = [
  {
    icon: History,
    title: "Bills that arrive late",
    body: "The water statement that turns up at the end of September is August's usage. RoomPay bills it to whoever lived here in August — not to whoever happens to be on September's split.",
  },
  {
    icon: UserRoundPlus,
    title: "Moving in mid-month",
    body: "Say when someone moved in and every bill is weighted by the days of its service period they were actually here. No separate proration to do by hand, and no argument about the first month.",
  },
  {
    icon: Percent,
    title: "Splits that aren't even",
    body: "Split evenly, by percentage, or item by item — the bigger room pays more of the rent, the car owner pays the parking. Odd cents land on you, not on them.",
  },
  {
    icon: CalendarClock,
    title: "One bill, several months",
    body: "A quarterly sewer bill can cover three months at once. Whoever was here for part of that window pays for part of it, counted in days.",
  },
]

const PRIVACY = [
  {
    icon: Smartphone,
    title: "It lives in your browser",
    body: "Line items, amounts, saved months, who has paid — all of it stays on your device. There is no account to make and nothing to log into. A backup file moves everything to another device when you want it to.",
  },
  {
    icon: Link2,
    title: "Only a published link leaves",
    body: "Publishing sends one statement's numbers and the two labels you chose. Never names, never contact details, never anything about how you pay each other. The link is a random, unguessable address.",
  },
  {
    icon: ShieldCheck,
    title: "It cleans up after itself",
    body: "A link deletes itself 60 days after its last due date, and you can delete it sooner. Revoking one empties any calendar subscribed to it.",
  },
]

const FAQ = [
  {
    q: "Does RoomPay move money?",
    a: "No. It works out the numbers and the dates; you settle up however you already do. It never asks for a bank account, a card, or a payment handle.",
  },
  {
    q: "Do my roommates need an account?",
    a: "No. They open a link. They can pick how they'd like to pay across the month and add the dates to their calendar without installing or signing up for anything.",
  },
  {
    q: "What do my roommates actually see?",
    a: "The lines they have a stake in, what each one covers, their share, and the payment options. Not another roommate's share, and not lines that are none of theirs.",
  },
  {
    q: "What if a bill turns up late, or covers an odd stretch?",
    a: "Change what that one month's bill covers — any start and end date you like. The split re-reckons itself, and everyone else's months are left alone.",
  },
  {
    q: "What happens when someone moves out?",
    a: "Give them a move-out date. Bills covering service after it stop landing on them, and bills that straddle it are split by the days they were here. Their history stays.",
  },
  {
    q: "Will the dates stay up to date in my roommate's calendar?",
    a: "If they subscribe to their link's feed, yes. Each payment's title leads with where it stands — Paid, Pay now, Pending, Overdue — and the feed is worked out fresh each time it's fetched.",
  },
]

export default function Page() {
  return (
    <>
      <SiteHeader appUrl={APP_URL} />

      <main id="top">
        {/* Hero */}
        <div className="border-t-0">
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <div className="flex flex-col items-start gap-6">
                <p className="eyebrow">Rent · utilities · roommates</p>
                <h1 className="font-heading text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  Split the rent without the spreadsheet.
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                  Work out what each roommate owes, offer a few ways to pay it across the month,
                  and send them a link with the dates. Every bill is charged for the period it
                  covers — so the water bill that arrives today doesn&apos;t land on someone who
                  moved in last week.
                </p>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="h-11 w-full px-5 text-base sm:w-auto">
                    <a href={APP_URL}>Open RoomPay</a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-11 w-full px-5 text-base sm:w-auto"
                  >
                    <a href="#timing">See how the dates work</a>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  No account. Nothing to install. Your figures stay on your device.
                </p>
              </div>

              <StatementPreview />
            </div>
          </div>
        </div>

        {/* The idea */}
        <Band id="timing" className="bg-muted/40">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
            <Heading
              eyebrow="The part everyone gets wrong"
              title="The bill that arrives today isn't for today."
              lead={
                <>
                  Most apps split whatever lands this month across whoever&apos;s here this month.
                  That quietly charges new roommates for service they weren&apos;t around for, and
                  lets people leave owing nothing for their last month.
                </>
              }
            />
            <TimingDiagram />
          </div>

          <dl className="mt-12 grid gap-6 border-t pt-10 sm:grid-cols-3">
            {[
              ["Billed", "The statement it lands on.", "Which month's paperwork it belongs to."],
              ["Covers", "The service it pays for.", "Who owes it."],
              ["Due", "When the money has to leave.", "When you pay, and where it sits on the calendar."],
            ].map(([term, what, decides]) => (
              <div key={term} className="flex flex-col gap-1.5">
                <dt className="font-heading text-lg font-semibold">{term}</dt>
                <dd className="text-sm text-muted-foreground">
                  {what}
                  <span className="mt-1 block text-foreground">{decides}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Band>

        {/* Fairness */}
        <Band>
          <Heading
            eyebrow="What that buys you"
            title="The awkward months work out on their own."
            lead="Move-ins, move-outs, bills in arrears and quarterly statements all fall out of the same rule: you owe the days you were here."
          />
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FAIRNESS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-heading text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Band>

        {/* Steps */}
        <Band id="steps" className="bg-muted/40">
          <Heading
            eyebrow="How it works"
            title="Three things, once a month."
            lead="Setting up takes a few minutes. After that a month is mostly typing in the numbers off the statements."
          />
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-3">
                <span className="flex items-center gap-3">
                  <span className="tabular flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-primary" aria-hidden />
                </span>
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </Band>

        {/* The roommate's side */}
        <Band>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
            <div className="flex flex-col gap-6">
              <Heading
                eyebrow="Their side of it"
                title="A link, a plan they choose, and dates that keep themselves honest."
                lead="Your roommate opens one link. It shows their share and the ways they can spread it — in full, twice a month, weekly, or whatever cadences you set up."
              />
              <ul className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                {[
                  [CalendarPlus, "They add the dates to Google, Apple or Outlook in a tap — or subscribe once, and every month you publish afterwards shows up on its own."],
                  [Gauge, "As you mark payments received, the running total goes with it, so their calendar says what's Paid and what's Overdue without you texting."],
                  [Link2, "One link per roommate, and it lasts. Months stack up inside it instead of becoming a new link each time."],
                ].map(([Icon, text]) => {
                  const Glyph = Icon as typeof CalendarPlus
                  return (
                    <li key={text as string} className="flex gap-3">
                      <Glyph className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{text as string}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <PlanPreview />
          </div>
        </Band>

        {/* Privacy */}
        <Band id="privacy" className="bg-muted/40">
          <Heading
            eyebrow="What's stored, and where"
            title="Roommates are labels. Nobody is a record."
            lead="RoomPay is built so there's almost nothing to leak: no account, no names, no payment details, and a server that only ever sees the numbers you decide to publish."
          />
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {PRIVACY.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-2.5">
                <Icon className="size-6 text-primary" aria-hidden />
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl border-t pt-6 text-sm text-muted-foreground">
            Roommates are whatever you call them — “Biscuit”, “Room B”, an initial. That label and
            the name you give the place are the only words a share link carries.
          </p>
        </Band>

        {/* FAQ */}
        <Band id="faq">
          <Heading eyebrow="Questions" title="The usual ones." />
          <div className="mt-8 max-w-3xl divide-y border-y">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg font-medium focus-visible:ring-3 focus-visible:ring-ring/50">
                  {q}
                  <span
                    className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </Band>

        {/* Close */}
        <Band className="bg-accent text-accent-foreground">
          <div className="flex flex-col items-start gap-6">
            <h2 className="font-heading max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              Work out this month in the time it takes to read the statement.
            </h2>
            <Button asChild size="lg" className="h-11 w-full px-5 text-base sm:w-auto">
              <a href={APP_URL}>Open RoomPay</a>
            </Button>
            <p className="text-sm opacity-80">
              Figures are estimates until the statement posts — reconcile against the actual bill
              each month.
            </p>
          </div>
        </Band>
      </main>

      <SiteFooter appUrl={APP_URL} />
    </>
  )
}
