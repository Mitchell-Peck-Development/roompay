import { iconResponse } from "@/lib/icon"

const VARIANTS: Record<string, { size: number; maskable?: boolean }> = {
  "192": { size: 192 },
  "512": { size: 512 },
  "maskable-512": { size: 512, maskable: true },
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const variant = VARIANTS[(await params).variant]
  if (!variant) return new Response("Not found", { status: 404 })
  const response = iconResponse(variant.size, { maskable: variant.maskable, rounded: !variant.maskable })
  response.headers.set("Cache-Control", "public, max-age=86400, immutable")
  return response
}
