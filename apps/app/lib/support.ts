/**
 * The tip jar.
 *
 * RoomPay is free, has no accounts and no paid tier, so this link is the whole
 * of its funding. It points away from the app — following it sends nothing
 * with you, and nothing here is recorded.
 *
 * Put your Ko-fi handle in `KOFI_HANDLE` and every tip surface appears. Leave
 * it empty and they all disappear: that's how a fork, or a self-hosted copy,
 * turns the asking off without touching anything else.
 *
 * Typed as `string` on purpose — an empty literal would narrow the type and
 * make every "is it configured?" check look like dead code to TypeScript.
 */
const KOFI_HANDLE: string = ""

export const SUPPORT_URL: string = KOFI_HANDLE ? `https://ko-fi.com/${KOFI_HANDLE}` : ""

/**
 * Whether to show the tip line in the share card after a statement publishes.
 *
 * The moment a link goes out is the moment the app has just done the month's
 * work, which is the only honest time to ask. But a first-timer has been given
 * nothing yet, so the ask waits until a second month has been saved — and once
 * it's been dismissed, or followed, it never comes back.
 */
export function shouldShowTipNudge(args: {
  savedMonths: number
  dismissedAt?: string
  justPublished: boolean
  supportUrl: string
}): boolean {
  if (!args.supportUrl || args.dismissedAt || !args.justPublished) return false
  return args.savedMonths >= 2
}
