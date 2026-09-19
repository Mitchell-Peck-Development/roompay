import { createClient } from "@supabase/supabase-js"
import type { RpBackend, RpFunction, RpResult } from "./types"

/**
 * Production backend: the rp functions over Supabase RPC, using the project's
 * publishable key. The functions are the security boundary, so this process
 * never needs (and must never be given) the service-role key.
 */
export function createSupabaseBackend(url: string, key: string): RpBackend {
  const client = createClient(url, key, {
    db: { schema: "rp" },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    async call<T>(fn: RpFunction, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args)
      if (error) throw new Error(`rp.${fn} failed: ${error.message}`)
      return data as RpResult<T>
    },
  }
}
