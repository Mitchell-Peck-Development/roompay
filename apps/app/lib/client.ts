"use client"

import * as React from "react"

const noSubscription = () => () => {}

/** True once running in the browser; false during SSR and hydration. */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(noSubscription, () => true, () => false)
}

/**
 * A value that only exists in the browser (user agent, display mode…),
 * read without an effect. `read` must return a primitive so React can
 * compare snapshots.
 */
export function useBrowserValue<T extends string | number | boolean | null>(
  read: () => T,
  onServer: T
): T {
  return React.useSyncExternalStore(noSubscription, read, () => onServer)
}
