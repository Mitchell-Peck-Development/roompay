/**
 * Share links this device has opened, so a roommate who installs the app (or
 * just comes back to the home page) can find their way to their link again.
 * Stored only in this browser.
 */
const KEY = "roompay:received"
const MAX = 10

export type ReceivedLink = {
  token: string
  householdLabel: string
  roommateLabel: string
  seenAt: string
}

export function readReceived(): ReceivedLink[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(raw) ? raw.filter((r) => typeof r?.token === "string") : []
  } catch {
    return []
  }
}

export function rememberReceived(link: Omit<ReceivedLink, "seenAt">) {
  try {
    const rest = readReceived().filter((r) => r.token !== link.token)
    const next = [{ ...link, seenAt: new Date().toISOString() }, ...rest].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing or storage disabled — remembering is only a convenience.
  }
}

export function forgetReceived(token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readReceived().filter((r) => r.token !== token)))
  } catch {
    // ignore
  }
}
