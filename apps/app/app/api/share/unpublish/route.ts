import { fail, handle, json } from "@/lib/server/http"
import { unpublishStatement } from "@/lib/server/rp/service"
import { unpublishBody } from "@/lib/server/schemas"

export async function POST(request: Request) {
  return handle(request, unpublishBody, async (input) => {
    const result = await unpublishStatement(input)
    return result.ok ? json(result) : fail(result.error)
  })
}
