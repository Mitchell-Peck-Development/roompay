"use client"

import * as React from "react"
import type { LinkStatus } from "@/app/api/share/status/route"
import { shareClient } from "./share-client"

/**
 * What the server knows about a link — chiefly which plan the roommate picked.
 * Refreshes on mount, whenever the window regains focus, and on demand.
 */
export function useLinkStatus(token: string | undefined) {
  const [status, setStatus] = React.useState<LinkStatus | null>(null)

  const refresh = React.useCallback(async () => {
    if (!token) return setStatus(null)
    const result = await shareClient.status([token])
    if (result.ok) setStatus(result.links[token] ?? { ok: false })
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

  return { status, refresh }
}
