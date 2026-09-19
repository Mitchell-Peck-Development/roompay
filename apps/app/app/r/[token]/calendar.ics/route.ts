import { TOKEN_RE, isPeriod, statementKindSchema, todayISO } from "@workspace/core"
import { appOrigin } from "@/lib/server/origin"
import { buildFeed, buildOneOff } from "@/lib/server/rp/feed"
import { viewLink } from "@/lib/server/rp/service"

function calendar(body: string, filename: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // "inline" is what lets iOS Safari show its Add-to-Calendar sheet
      // instead of saving a file.
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  })
}

/**
 * No query  → the subscribable feed for this link.
 * ?period=  → a one-off calendar for that statement (&kind=, &plan= optional).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const url = new URL(request.url)
  const origin = appOrigin(request)
  const view = TOKEN_RE.test(token) ? await viewLink(token) : null

  const period = url.searchParams.get("period")
  if (period === null) {
    return calendar(buildFeed(view, { origin, token, today: todayISO() }), "roompay.ics")
  }

  const kind = statementKindSchema.safeParse(url.searchParams.get("kind") ?? "monthly")
  if (!view || !isPeriod(period) || !kind.success) {
    return new Response("Not found", { status: 404 })
  }
  const body = buildOneOff(view, {
    origin,
    token,
    period,
    kind: kind.data,
    plan: url.searchParams.get("plan"),
  })
  if (!body) return new Response("Not found", { status: 404 })
  return calendar(body, `roompay-${period}.ics`)
}
