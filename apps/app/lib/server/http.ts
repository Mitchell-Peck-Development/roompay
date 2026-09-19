import type { z } from "zod"
import { SharingUnconfiguredError } from "./rp/backend"
import type { RpErrorCode } from "./rp/types"

const STATUS: Record<RpErrorCode, number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  busy: 429,
}

export type ApiError = RpErrorCode | "sharing_unconfigured" | "server"

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export const fail = (error: RpErrorCode) => json({ ok: false, error }, STATUS[error])

/**
 * Parses and validates a JSON body, runs the handler, and turns failures into
 * the API's uniform `{ ok: false, error }` shape.
 */
export async function handle<T>(
  request: Request,
  schema: z.ZodType<T>,
  run: (input: T) => Promise<Response>
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail("invalid")
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return fail("invalid")

  try {
    return await run(parsed.data)
  } catch (error) {
    if (error instanceof SharingUnconfiguredError) {
      // Names, never values — this is the one thing that makes a 503 here
      // diagnosable from a deploy log instead of a guess.
      console.error("[share]", error.message)
      return json(
        { ok: false, error: "sharing_unconfigured", missing: error.missing },
        503
      )
    }
    console.error("[share]", error)
    return json({ ok: false, error: "server" }, 500)
  }
}
