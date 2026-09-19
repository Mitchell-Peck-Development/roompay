/**
 * The public origin used in share links and calendar feeds. Calendar services
 * fetch feeds from their own servers, so this must be the externally
 * reachable address — set APP_URL in production.
 *
 * Deliberately not a NEXT_PUBLIC_ variable: Next inlines those at build time,
 * even in server code, and this has to follow the running server's config.
 */
export function originFromHeaders(headers: Headers, fallback?: string): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "")
  if (configured) return configured

  const host = headers.get("x-forwarded-host") ?? headers.get("host")
  if (host) {
    const proto =
      headers.get("x-forwarded-proto") ??
      (fallback ? new URL(fallback).protocol.replace(":", "") : "https")
    return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`
  }
  return fallback ? new URL(fallback).origin : "http://localhost:3001"
}

export function appOrigin(request: Request): string {
  return originFromHeaders(request.headers, request.url)
}
