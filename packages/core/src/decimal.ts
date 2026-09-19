/**
 * Exact decimal arithmetic for metered line items, where a rate like
 * $0.13456/kWh times a usage like 23.4 has to land on the right cent.
 */
export type Decimal = { value: bigint; scale: number }

const DECIMAL_RE = /^(-)?(\d*)(?:\.(\d*))?$/

export function parseDecimal(input: string): Decimal | null {
  const cleaned = input.replace(/[,\s]/g, "")
  const match = DECIMAL_RE.exec(cleaned)
  if (!match) return null
  const [, sign, whole = "", fraction = ""] = match
  if (whole === "" && fraction === "") return null
  const value = BigInt((whole || "0") + fraction)
  return { value: sign ? -value : value, scale: fraction.length }
}

function rescale(d: Decimal, scale: number): bigint {
  return d.value * 10n ** BigInt(scale - d.scale)
}

export function subDecimal(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale)
  return { value: rescale(a, scale) - rescale(b, scale), scale }
}

export function mulDecimal(a: Decimal, b: Decimal): Decimal {
  return { value: a.value * b.value, scale: a.scale + b.scale }
}

export function isNegative(d: Decimal): boolean {
  return d.value < 0n
}

/** Treats the decimal as dollars; rounds half away from zero to whole cents. */
export function dollarsToCents(d: Decimal): number {
  if (d.scale <= 2) return Number(rescale(d, 2))
  const divisor = 10n ** BigInt(d.scale - 2)
  const negative = d.value < 0n
  const abs = negative ? -d.value : d.value
  const rounded = (abs + divisor / 2n) / divisor
  return Number(negative ? -rounded : rounded)
}

/** Shortest plain form: "23.40" → "23.4", "5.00" → "5". */
export function formatDecimal(d: Decimal): string {
  const negative = d.value < 0n
  const digits = (negative ? -d.value : d.value)
    .toString()
    .padStart(d.scale + 1, "0")
  const whole = digits.slice(0, digits.length - d.scale)
  const fraction = digits.slice(digits.length - d.scale).replace(/0+$/, "")
  const text = fraction ? `${whole}.${fraction}` : whole
  return negative && d.value !== 0n ? `-${text}` : text
}
