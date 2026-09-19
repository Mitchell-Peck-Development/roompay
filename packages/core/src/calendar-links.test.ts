import { describe, expect, it } from "vitest"
import * as L from "./calendar-links"

const feed = "https://app.example/r/abc/calendar.ics"
const webcal = "webcal://app.example/r/abc/calendar.ics"

describe("calendar links", () => {
  it("detects platforms", () => {
    expect(L.detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios")
    expect(L.detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios")
    expect(L.detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios")
    expect(L.detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("mac")
    expect(L.detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android")
    expect(L.detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows")
    expect(L.detectPlatform("")).toBe("other")
  })

  it("builds subscribe links", () => {
    expect(L.webcalUrl(feed)).toBe(webcal)
    expect(L.webcalUrl("http://localhost:3001/x.ics")).toBe("webcal://localhost:3001/x.ics")
    expect(L.googleSubscribeUrl(feed)).toBe(
      "https://calendar.google.com/calendar/u/0/r?cid=" + encodeURIComponent(webcal)
    )
    expect(L.outlookSubscribeUrl(feed, "RoomPay · 3012", "live")).toBe(
      "https://outlook.live.com/calendar/0/addfromweb/?url=" +
        encodeURIComponent(webcal) +
        "&name=" +
        encodeURIComponent("RoomPay · 3012")
    )
    expect(L.outlookSubscribeUrl(feed, "x", "office")).toContain(
      "https://outlook.office.com/calendar/0/addfromweb/?"
    )
  })

  it("builds single-event links", () => {
    const g = new URL(L.googleEventUrl({ title: "Pay $10.00", date: "2026-10-31", details: "hi" }))
    expect(g.origin + g.pathname).toBe("https://calendar.google.com/calendar/render")
    expect(g.searchParams.get("action")).toBe("TEMPLATE")
    expect(g.searchParams.get("dates")).toBe("20261031/20261101")
    expect(g.searchParams.get("text")).toBe("Pay $10.00")
    expect(g.searchParams.get("details")).toBe("hi")
    expect(g.searchParams.get("trp")).toBe("false")

    const o = new URL(L.outlookEventUrl({ title: "Pay", date: "2026-10-31" }, "live"))
    expect(o.origin + o.pathname).toBe("https://outlook.live.com/calendar/0/deeplink/compose")
    expect(o.searchParams.get("rru")).toBe("addevent")
    expect(o.searchParams.get("startdt")).toBe("2026-10-31")
    expect(o.searchParams.get("enddt")).toBe("2026-11-01")
    expect(o.searchParams.get("allday")).toBe("true")
    expect(o.searchParams.get("subject")).toBe("Pay")
    // Outlook's mobile web treats the end date as inclusive.
    const m = new URL(L.outlookEventUrl({ title: "Pay", date: "2026-10-31" }, "office", { mobile: true }))
    expect(m.searchParams.get("enddt")).toBe("2026-10-31")
  })

  it("wraps a link in an Android intent that falls back to the browser", () => {
    const url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
    expect(L.androidCalendarIntent(url)).toBe(
      "intent://calendar.google.com/calendar/render?action=TEMPLATE#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=" +
        encodeURIComponent(url) +
        ";end"
    )
  })
})
