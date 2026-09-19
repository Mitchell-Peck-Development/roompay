/**
 * The public origin used in share links and calendar feeds. Calendar services
 * fetch feeds from their own servers, so this must be the externally
 * reachable address — set NEXT_PUBLIC_APP_URL in production.
 */
export function originFromHeaders(headers: Headers, fallback?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
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
