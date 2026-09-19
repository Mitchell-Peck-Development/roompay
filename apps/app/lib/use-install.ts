"use client"

import { type Platform, detectPlatform } from "@workspace/core"
import * as React from "react"
import { isStandalone } from "./durability"

type InstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// Chromium fires this once, possibly before any component mounts — so it's
// caught at module load and held for whoever asks.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useInstall(): {
  ready: boolean
  platform: Platform
  standalone: boolean
  canPrompt: boolean
  prompt(): Promise<boolean>
} {
  const canPrompt = React.useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  const [env, setEnv] = React.useState<{ platform: Platform; standalone: boolean } | null>(null)

  React.useEffect(() => {
    setEnv({
      platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
      standalone: isStandalone(),
    })
  }, [])

  return {
    ready: env !== null,
    platform: env?.platform ?? "other",
    standalone: env?.standalone ?? false,
    canPrompt,
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome === "accepted"
    },
  }
}
