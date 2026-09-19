import { type ISODate, addDays } from "./dates"

/**
 * Deep links that hand due dates to a calendar app without a file download.
 * URL shapes follow the add-to-calendar-button project, the de-facto reference.
 */
export type Platform = "ios" | "mac" | "android" | "windows" | "other"

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios"
  if (/Android/i.test(userAgent)) return "android"
  // iPadOS asks for desktop sites, so it looks like a Mac — but Macs have no touch.
  if (/Macintosh|Mac OS X/i.test(userAgent)) return maxTouchPoints > 1 ? "ios" : "mac"
  if (/Windows/i.test(userAgent)) return "windows"
  return "other"
}

/** webcal:// opens the system calendar's "subscribe" flow directly. */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//i, "webcal://")
}

export function googleSubscribeUrl(feedUrl: string): string {
  return (
    "https://calendar.google.com/calendar/u/0/r?cid=" +
    encodeURIComponent(webcalUrl(feedUrl))
  )
}

export type OutlookHost = "live" | "office"

const outlookOrigin = (host: OutlookHost) =>
  host === "live" ? "https://outlook.live.com" : "https://outlook.office.com"

export function outlookSubscribeUrl(
  feedUrl: string,
  name: string,
  host: OutlookHost
): string {
  return (
    `${outlookOrigin(host)}/calendar/0/addfromweb/?url=` +
    encodeURIComponent(webcalUrl(feedUrl)) +
    "&name=" +
    encodeURIComponent(name)
  )
}

export type LinkEvent = { title: string; date: ISODate; details?: string }

const compact = (date: ISODate) => date.replace(/-/g, "")

/** A prefilled all-day event in Google Calendar, marked as "free". */
export function googleEventUrl(event: LinkEvent): string {
  const parts = [
    "action=TEMPLATE",
    `dates=${compact(event.date)}%2F${compact(addDays(event.date, 1))}`,
    `text=${encodeURIComponent(event.title)}`,
  ]
  if (event.details) parts.push(`details=${encodeURIComponent(event.details)}`)
  parts.push("crm=AVAILABLE", "trp=false")
  return `https://calendar.google.com/calendar/render?${parts.join("&")}`
}

export function outlookEventUrl(
  event: LinkEvent,
  host: OutlookHost,
  options: { mobile?: boolean } = {}
): string {
  // Desktop Outlook wants an exclusive end date; its mobile web an inclusive one.
  const end = options.mobile ? event.date : addDays(event.date, 1)
  const parts = [
    "path=%2Fcalendar%2Faction%2Fcompose",
    "rru=addevent",
    `startdt=${event.date}`,
    `enddt=${end}`,
    "allday=true",
    `subject=${encodeURIComponent(event.title)}`,
  ]
  if (event.details) parts.push(`body=${encodeURIComponent(event.details)}`)
  return `${outlookOrigin(host)}/calendar/0/deeplink/compose?${parts.join("&")}`
}

/** Opens an https Google Calendar link in the Android app, else the browser. */
export function androidCalendarIntent(httpsUrl: string): string {
  return (
    `intent://${httpsUrl.replace(/^https:\/\//, "")}` +
    "#Intent;scheme=https;package=com.google.android.calendar;" +
    `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
  )
}
