"use client"

import * as React from "react"

/** Registers the offline shell. Production only, so dev never serves stale code. */
export function SwRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is a bonus; the app works without it.
    })
  }, [])
  return null
}
