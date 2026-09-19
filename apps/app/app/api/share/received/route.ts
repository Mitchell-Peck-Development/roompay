import { fail, handle, json } from "@/lib/server/http"
import { setReceived } from "@/lib/server/rp/service"
import { receivedBody } from "@/lib/server/schemas"

/** The owner's running total for a statement, so the calendar can say "Paid". */
export async function POST(request: Request) {
  return handle(request, receivedBody, async (input) => {
    const result = await setReceived(input)
    return result.ok ? json(result) : fail(result.error)
  })
}
