import { TOKEN_RE, isPeriod } from "@workspace/core"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { originFromHeaders } from "@/lib/server/origin"
import { type LinkView, viewLink } from "@/lib/server/rp/service"

/** Link previews (Messages, WhatsApp…) must never show amounts. */
export const shareMetadata: Metadata = {
  title: "Your share",
  description: "Your share of the bills, and the dates it's due.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

export async function loadLink(token: string): Promise<{ view: LinkView | null; origin: string }> {
  const origin = originFromHeaders(await headers())
  if (!TOKEN_RE.test(token)) return { view: null, origin }
  return { view: await viewLink(token), origin }
}

export function findStatement(view: LinkView, period?: string, kind?: string) {
  if (!period) return view.statements[0]
  if (!isPeriod(period)) return undefined
  const matches = view.statements.filter((s) => s.period === period)
  return matches.find((s) => s.kind === (kind ?? "monthly")) ?? (kind ? undefined : matches[0])
}
