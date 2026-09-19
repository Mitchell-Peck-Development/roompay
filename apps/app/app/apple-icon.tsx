import { iconResponse } from "@/lib/icon"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  // iOS rounds the corners itself.
  return iconResponse(180)
}
