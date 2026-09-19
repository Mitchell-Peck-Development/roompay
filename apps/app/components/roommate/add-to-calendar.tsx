"use client"

import {
  type Platform,
  type PlanPayment,
  androidCalendarIntent,
  detectPlatform,
  formatMoney,
  formatShortDate,
  googleEventUrl,
  googleSubscribeUrl,
  outlookEventUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { CalendarPlus, ChevronDown, Repeat } from "lucide-react"
import * as React from "react"

type Props = {
  origin: string
  token: string
  period: string
  kind: "monthly" | "catchup"
  plan: { key: string; name: string; payments: PlanPayment[] }
  title: string
  householdLabel: string
  currency: string
  pageUrl: string
}

type Action = {
  label: string
  hint: string
  href: string
  icon: "add" | "subscribe"
  /** Web calendars open in a new tab; calendar files and webcal:// stay put. */
  newTab?: boolean
}

/**
 * Hands the due dates to whatever calendar this device uses, without a file
 * landing in Downloads: iPhone gets the native "Add All" sheet, Mac and the
 * web calendars get a subscription, Android goes through Google Calendar.
 */
export function AddToCalendar(props: Props) {
  const { origin, token, period, kind, plan, title, householdLabel, currency, pageUrl } = props
  const [platform, setPlatform] = React.useState<Platform | null>(null)
  React.useEffect(() => setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints)), [])

  const feed = `${origin}/r/${token}/calendar.ics`
  const oneOff = `${feed}?${new URLSearchParams({ period, kind, plan: plan.key })}`
  const calendarName = householdLabel.trim() ? `RoomPay · ${householdLabel.trim()}` : "RoomPay"
  const count = plan.payments.length
  const dates = count === 1 ? "this date" : `these ${count} dates`

  const add: Action = { label: "Add to Calendar", hint: `Adds ${dates} to your calendar.`, href: oneOff, icon: "add" }
  const subscribeApple: Action = {
    label: "Subscribe in Calendar",
    hint: "Every month sent to this link shows up by itself.",
    href: webcalUrl(feed),
    icon: "subscribe",
  }
  const subscribeGoogle: Action = {
    label: "Subscribe in Google Calendar",
    hint: "Every month sent to this link shows up by itself — Google can take up to a day to refresh.",
    href: googleSubscribeUrl(feed),
    icon: "subscribe",
    newTab: true,
  }
  const subscribeOutlook: Action = {
    label: "Subscribe in Outlook.com",
    hint: "Every month sent to this link shows up by itself.",
    href: outlookSubscribeUrl(feed, calendarName, "live"),
    icon: "subscribe",
    newTab: true,
  }

  const [primary, secondary]: [Action, Action] =
    platform === "ios"
      ? [add, { ...subscribeApple, label: "Subscribe instead" }]
      : platform === "mac"
        ? [subscribeApple, { ...add, label: "Add just this month", hint: `Opens a calendar file with ${dates}.` }]
        : platform === "android"
          ? [subscribeGoogle, { ...subscribeOutlook }]
          : platform === null
            ? // Before JavaScript runs (or without it): links that work anywhere.
              [add, { ...subscribeApple, label: "Subscribe" }]
            : [subscribeGoogle, subscribeOutlook]

  const mobile = platform === "ios" || platform === "android"
  const event = (payment: PlanPayment) => ({
    title: `Pay ${formatMoney(payment.amountCents, currency)} · ${householdLabel.trim() || "RoomPay"}`,
    date: payment.date,
    details: `${title} · ${plan.name} · ${payment.label}\n${pageUrl}`,
  })
  const googleLink = (payment: PlanPayment) => {
    const url = googleEventUrl(event(payment))
    return platform === "android" ? androidCalendarIntent(url) : url
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <CalendarButton action={primary} variant="default" />
        <CalendarButton action={secondary} variant="outline" />
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Other calendar apps
          <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <p className="eyebrow">Subscribe — future months arrive on their own</p>
            <ul className="flex flex-col gap-1.5">
              <li><a className="text-primary underline-offset-4 hover:underline" href={webcalUrl(feed)}>Apple Calendar (iPhone, iPad, Mac)</a></li>
              <li><a className="text-primary underline-offset-4 hover:underline" href={googleSubscribeUrl(feed)} target="_blank" rel="noreferrer">Google Calendar</a></li>
              <li><a className="text-primary underline-offset-4 hover:underline" href={outlookSubscribeUrl(feed, calendarName, "live")} target="_blank" rel="noreferrer">Outlook.com</a></li>
              <li><a className="text-primary underline-offset-4 hover:underline" href={outlookSubscribeUrl(feed, calendarName, "office")} target="_blank" rel="noreferrer">Outlook for work or school (Microsoft 365)</a></li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Anything else that takes a calendar URL: <span className="tabular break-all select-all">{feed}</span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="eyebrow">Or add each payment on its own</p>
            <ul className="flex flex-col divide-y rounded-lg border">
              {plan.payments.map((payment) => (
                <li key={payment.date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="tabular">
                    {formatShortDate(payment.date)} · {formatMoney(payment.amountCents, currency)}
                  </span>
                  <span className="flex gap-3 text-xs">
                    <a className="text-primary underline-offset-4 hover:underline" href={googleLink(payment)} target="_blank" rel="noreferrer">Google</a>
                    <a className="text-primary underline-offset-4 hover:underline" href={outlookEventUrl(event(payment), "live", { mobile })} target="_blank" rel="noreferrer">Outlook.com</a>
                    <a className="text-primary underline-offset-4 hover:underline" href={outlookEventUrl(event(payment), "office", { mobile })} target="_blank" rel="noreferrer">Microsoft 365</a>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Last resort:{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={oneOff} download={`roompay-${period}.ics`}>
              download a calendar file
            </a>{" "}
            and open it with your calendar app.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function CalendarButton({ action, variant }: { action: Action; variant: "default" | "outline" }) {
  const Icon = action.icon === "add" ? CalendarPlus : Repeat
  return (
    <Button asChild variant={variant} className="h-auto flex-1 justify-start px-3.5 py-2.5 text-left whitespace-normal">
      <a href={action.href} {...(action.newTab ? { target: "_blank", rel: "noreferrer" } : {})}>
        <Icon className="size-5 shrink-0" />
        <span className="flex flex-col">
          <span className="font-semibold">{action.label}</span>
          <span className="text-xs font-normal opacity-80">{action.hint}</span>
        </span>
      </a>
    </Button>
  )
}
