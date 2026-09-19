import { fail, handle, json } from "@/lib/server/http"
import { publishStatement } from "@/lib/server/rp/service"
import { publishBody } from "@/lib/server/schemas"

export async function POST(request: Request) {
  return handle(request, publishBody, async (input) => {
    const result = await publishStatement(input)
    return result.ok ? json(result) : fail(result.error)
  })
}
