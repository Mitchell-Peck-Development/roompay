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

const listeners = new Set<() => void>()

export function subscribeReceived(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => event.key === KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** The raw stored string — a stable snapshot for useSyncExternalStore. */
export function receivedSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

export function parseReceived(raw: string): ReceivedLink[] {
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((r) => typeof r?.token === "string") : []
  } catch {
    return []
  }
}

function write(list: ReceivedLink[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Private browsing or storage disabled — remembering is only a convenience.
  }
  listeners.forEach((listener) => listener())
}

export function rememberReceived(link: Omit<ReceivedLink, "seenAt">) {
  const rest = parseReceived(receivedSnapshot()).filter((r) => r.token !== link.token)
  write([{ ...link, seenAt: new Date().toISOString() }, ...rest].slice(0, MAX))
}

export function forgetReceived(token: string) {
  write(parseReceived(receivedSnapshot()).filter((r) => r.token !== token))
}
