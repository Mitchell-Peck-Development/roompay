import { handle, json } from "@/lib/server/http"
import { viewLink } from "@/lib/server/rp/service"
import { statusBody } from "@/lib/server/schemas"

export type LinkStatus =
  | {
      ok: true
      preferredPlan: string | null
      expiresAt: string
      statements: {
        period: string
        kind: "monthly" | "catchup"
        chosenPlan: string | null
        chosenAt: string | null
        receivedCents: number
        revision: number
        updatedAt: string
      }[]
    }
  | { ok: false }

/** The owner's app polls this to learn which plan each roommate picked. */
export async function POST(request: Request) {
  return handle(request, statusBody, async ({ tokens }) => {
    const entries = await Promise.all(
      [...new Set(tokens)].map(async (token): Promise<[string, LinkStatus]> => {
        const view = await viewLink(token)
        if (!view) return [token, { ok: false }]
        return [
          token,
          {
            ok: true,
            preferredPlan: view.link.preferredPlan,
            expiresAt: view.link.expiresAt,
            statements: view.statements.map((s) => ({
              period: s.period,
              kind: s.kind,
              chosenPlan: s.chosenPlan,
              chosenAt: s.chosenAt,
              receivedCents: s.receivedCents,
              revision: s.revision,
              updatedAt: s.updatedAt,
            })),
          },
        ]
      })
    )
    return json({ ok: true, links: Object.fromEntries(entries) })
  })
}
