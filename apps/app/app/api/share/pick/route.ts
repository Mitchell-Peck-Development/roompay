import { fail, handle, json } from "@/lib/server/http"
import { pickPlanFor } from "@/lib/server/rp/service"
import { pickBody } from "@/lib/server/schemas"

export async function POST(request: Request) {
  return handle(request, pickBody, async (input) => {
    const result = await pickPlanFor(input)
    return result.ok ? json(result) : fail(result.error)
  })
}
