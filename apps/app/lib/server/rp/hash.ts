import { createHash } from "node:crypto"

/**
 * Link tokens and write keys are hashed here, in the app server, so the
 * database only ever sees (and stores) digests.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
