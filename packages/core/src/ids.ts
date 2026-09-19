// crypto.randomUUID() only exists in secure contexts; getRandomValues works
// everywhere (including http:// on a LAN during development).
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/** A v4-shaped UUID for local records. */
export function newId(): string {
  const b = randomBytes(16)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** An unguessable base64url secret; 16 bytes → 22 characters. */
export function randomToken(bytes = 16): string {
  let binary = ""
  for (const byte of randomBytes(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
