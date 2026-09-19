/** The functions exposed by the rp schema (see supabase/migrations). */
export type RpFunction = "publish" | "unpublish" | "revoke" | "view" | "pick"

export type RpErrorCode = "invalid" | "not_found" | "forbidden" | "busy"

export type RpResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: RpErrorCode }

/**
 * The only way the app reaches the database. Two implementations: Supabase
 * RPC in production, and PGlite (running the same migration SQL in-process)
 * for development and tests.
 */
export interface RpBackend {
  call<T = Record<string, unknown>>(
    fn: RpFunction,
    args: Record<string, unknown>
  ): Promise<RpResult<T>>
}
