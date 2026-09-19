import path from "node:path"
import { createSupabaseBackend } from "./supabase"
import type { RpBackend } from "./types"

/** Thrown when a production server has no database configured. */
export class SharingUnconfiguredError extends Error {
  constructor() {
    super("Sharing is not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.")
    this.name = "SharingUnconfiguredError"
  }
}

// Survives hot reloads in development, where modules are re-evaluated.
const store = globalThis as typeof globalThis & {
  __roompayBackend?: Promise<RpBackend & { close?: () => Promise<void> }>
}

async function create(): Promise<RpBackend & { close?: () => Promise<void> }> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  const forcePglite = process.env.RP_BACKEND === "pglite"

  if (url && key && !forcePglite) return createSupabaseBackend(url, key)

  // The in-process database is for development and tests. A production server
  // only uses it when explicitly told to (RP_BACKEND=pglite, e.g. for the e2e
  // run against `next start`); otherwise sharing reports itself unconfigured.
  if (process.env.NODE_ENV !== "production" || forcePglite) {
    const { createPgliteBackend } = await import("./pglite")
    return createPgliteBackend({
      dataDir: process.env.RP_PGLITE_DIR ?? path.resolve(process.cwd(), ".pglite"),
    })
  }

  throw new SharingUnconfiguredError()
}

export function getBackend(): Promise<RpBackend> {
  if (!store.__roompayBackend) {
    store.__roompayBackend = create().catch((error) => {
      store.__roompayBackend = undefined
      throw error
    })
  }
  return store.__roompayBackend
}

export async function resetBackendForTests(): Promise<void> {
  const current = store.__roompayBackend
  store.__roompayBackend = undefined
  if (current) await (await current).close?.()
}
