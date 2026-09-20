"use client"

import * as React from "react"

/** Registers the offline shell. Production only, so dev never serves stale code. */
export function SwRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    // Root scope, even though the app lives at "/app": anyone who installed
    // v1 already has a worker registered at "/", and re-registering there
    // updates it in place instead of leaving it serving a stale "/".
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is a bonus; the app works without it.
    })
  }, [])
  return null
}
