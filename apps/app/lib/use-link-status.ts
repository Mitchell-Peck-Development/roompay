"use client"

import * as React from "react"
import type { LinkStatus } from "@/app/api/share/status/route"
import { shareClient } from "./share-client"

/**
 * What the server knows about a link — chiefly which plan the roommate picked.
 * Refreshes on mount, whenever the window regains focus, and on demand.
 */
export function useLinkStatus(token: string | undefined) {
  // Tagged with the token it belongs to, so a stale answer is never shown
  // for a different (or forgotten) link.
  const [entry, setEntry] = React.useState<{ token: string; status: LinkStatus } | null>(null)

  const refresh = React.useCallback((): Promise<void> => {
    if (!token) return Promise.resolve()
    return shareClient.status([token]).then((result) => {
      if (result.ok) setEntry({ token, status: result.links[token] ?? { ok: false } })
    })
  }, [token])

  React.useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    const onVisible = () => document.visibilityState === "visible" && void refresh()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  return { status: entry && entry.token === token ? entry.status : null, refresh }
}
