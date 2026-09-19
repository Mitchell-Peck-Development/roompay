import {
  type Decimal,
  dollarsToCents,
  formatDecimal,
  isNegative,
  mulDecimal,
  parseDecimal,
  subDecimal,
} from "./decimal"
import { type Cents, formatMoney } from "./money"
import type { LineMeter, MonthLine } from "./schema"

/** Units used this month: typed directly, or current reading − previous. */
export function meterUsage(meter: LineMeter): Decimal | null {
  if (meter.input === "usage") {
    const usage = parseDecimal(meter.usage ?? "")
    return usage && !isNegative(usage) ? usage : null
  }
  const prev = parseDecimal(meter.prev ?? "")
  const curr = parseDecimal(meter.curr ?? "")
  if (!prev || !curr) return null
  const usage = subDecimal(curr, prev)
  return isNegative(usage) ? null : usage
}

/** usage × rate + base fee, or null while something is still missing. */
export function meteredAmountCents(meter: LineMeter): Cents | null {
  const usage = meterUsage(meter)
  const rate = parseDecimal(meter.rate)
  if (!usage || !rate || isNegative(rate)) return null
  return dollarsToCents(mulDecimal(usage, rate)) + meter.baseFeeCents
}

export function lineAmountCents(line: MonthLine): Cents | null {
  if (line.kind === "metered" && line.meter) {
    return meteredAmountCents(line.meter)
  }
  return line.amountCents
}

/** "23.4 therm × $1.2345 + $12.00" — shown to the roommate as the working. */
export function meterDetail(
  meter: LineMeter,
  currency: string
): string | undefined {
  const usage = meterUsage(meter)
  const rate = parseDecimal(meter.rate)
  if (!usage || !rate) return undefined
  const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, "")
  const parts = [`${formatDecimal(usage)} ${meter.unit} × ${symbol}${formatDecimal(rate)}`]
  if (meter.baseFeeCents !== 0) {
    parts.push(formatMoney(meter.baseFeeCents, currency))
  }
  return parts.join(" + ")
}
