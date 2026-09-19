import { fail, handle, json } from "@/lib/server/http"
import { revokeLink } from "@/lib/server/rp/service"
import { revokeBody } from "@/lib/server/schemas"

export async function POST(request: Request) {
  return handle(request, revokeBody, async (input) => {
    const result = await revokeLink(input)
    return result.ok ? json(result) : fail(result.error)
  })
}
