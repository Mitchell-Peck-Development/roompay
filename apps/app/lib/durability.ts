/**
 * Asks the browser not to evict this site's storage under pressure. It can't
 * stop Safari's seven-day cleanup for sites you don't visit — installing the
 * app to the Home Screen is what avoids that — but it helps everywhere else.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
