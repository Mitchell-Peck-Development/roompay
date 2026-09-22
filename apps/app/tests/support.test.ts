import { describe, expect, it } from "vitest"
import { SUPPORT_URL, shouldShowTipNudge } from "@/lib/support"

/** A household that's been through a few months and just published one. */
const base = {
  savedMonths: 3,
  dismissedAt: undefined as string | undefined,
  justPublished: true,
  supportUrl: "https://ko-fi.com/example",
}

describe("the tip jar address", () => {
  it("is either switched off or a whole Ko-fi address", () => {
    const shape = /^https:\/\/ko-fi\.com\/[A-Za-z0-9_-]+$/
    expect(SUPPORT_URL === "" || shape.test(SUPPORT_URL)).toBe(true)
  })
})

describe("asking for a tip after publishing", () => {
  it("asks once a couple of months have been through the app", () => {
    expect(shouldShowTipNudge(base)).toBe(true)
  })

  it("stays quiet on someone's first month", () => {
    expect(shouldShowTipNudge({ ...base, savedMonths: 1 })).toBe(false)
  })

  it("stays quiet until a statement has actually been published", () => {
    expect(shouldShowTipNudge({ ...base, justPublished: false })).toBe(false)
  })

  it("never asks again once it's been dismissed", () => {
    expect(shouldShowTipNudge({ ...base, dismissedAt: "2026-09-20T09:00:00.000Z" })).toBe(false)
  })

  it("stays quiet when there's no tip jar to point at", () => {
    expect(shouldShowTipNudge({ ...base, supportUrl: "" })).toBe(false)
  })
})
