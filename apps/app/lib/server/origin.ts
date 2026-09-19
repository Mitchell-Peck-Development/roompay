/**
 * The public origin used in share links and calendar feeds. Calendar services
 * fetch feeds from their own servers, so this must be the externally
 * reachable address — set NEXT_PUBLIC_APP_URL in production.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
  if (configured) return configured

  const forwardedHost = request.headers.get("x-forwarded-host")
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https"
    return `${proto.split(",")[0]!.trim()}://${forwardedHost.split(",")[0]!.trim()}`
  }
  return new URL(request.url).origin
}
