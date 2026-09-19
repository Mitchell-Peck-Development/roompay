/** Every amount in RoomPay is an integer number of cents. */
export type Cents = number

const MONEY_RE = /^(-)?(\d*)(?:\.(\d{0,2}))?$/

/**
 * Parses what a person types into a money field. Accepts "$1,648.00", ".5",
 * "1648." and "-40"; returns null for anything else (including more than two
 * decimal places, so nothing is silently rounded).
 */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, "")
  const match = MONEY_RE.exec(cleaned)
  if (!match) return null
  const [, sign, whole = "", fraction = ""] = match
  if (whole === "" && fraction === "") return null
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(cents)) return null
  return sign ? -cents : cents
}

export function formatMoney(
  cents: Cents,
  currency = "USD",
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100)
}

/** Plain "1648.00" form for seeding a text input. */
export function formatAmountInput(cents: Cents | null): string {
  if (cents === null) return ""
  const abs = Math.abs(cents)
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
  return cents < 0 ? `-${text}` : text
}

/**
 * Splits `total` across `weights` with the largest-remainder method, so the
 * parts always sum to the total exactly. Ties go to the lowest index (the
 * owner). Negative totals mirror the positive split. If every weight is zero
 * the whole amount lands on index 0.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return []
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0)
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0))

  const parts = weights.map((w) => {
    const scaled = abs * Math.max(0, w)
    return { base: Math.floor(scaled / sum), remainder: scaled % sum }
  })
  let left = abs - parts.reduce((a, p) => a + p.base, 0)
  const order = parts
    .map((p, index) => ({ index, remainder: p.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const result = parts.map((p) => p.base)
  for (const { index } of order) {
    if (left <= 0) break
    result[index] = result[index]! + 1
    left -= 1
  }
  return result.map((v) => (v === 0 ? 0 : v * sign))
}

/** Divides `total` into `n` payments; odd cents go to the earliest ones. */
export function splitEven(total: Cents, n: number): Cents[] {
  if (n <= 0) return []
  return allocate(total, Array.from({ length: n }, () => 1))
}
