"use client"

import { formatAmountInput, parseMoney } from "@workspace/core"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { currencySymbol } from "@/lib/format"
import { useData } from "@/lib/store"

type Props = {
  value: number | null
  onCommit(value: number | null): void
  allowNegative?: boolean
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

/**
 * A text field for money. It commits as you type whenever the text parses, so
 * totals update live, and it keeps showing exactly what was typed until focus
 * leaves — no cursor jumps, no reformatting mid-keystroke.
 */
export function MoneyInput({
  value,
  onCommit,
  allowNegative = false,
  className,
  placeholder = "0.00",
  ...props
}: Props) {
  const symbol = currencySymbol(useData().household.currency)
  const [text, setText] = React.useState<string | null>(null)
  const shown = text ?? formatAmountInput(value)

  const parsed = text === null || text.trim() === "" ? null : parseMoney(text)
  const invalid =
    text !== null &&
    text.trim() !== "" &&
    (parsed === null || (!allowNegative && parsed < 0))

  function change(next: string) {
    setText(next)
    if (next.trim() === "") return onCommit(null)
    const cents = parseMoney(next)
    if (cents !== null && (allowNegative || cents >= 0)) onCommit(cents)
  }

  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className="tabular pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {symbol}
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        placeholder={placeholder}
        value={shown}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setText(formatAmountInput(value))
          e.currentTarget.select()
        }}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        className="tabular h-10 text-right"
        style={{ paddingLeft: `${0.9 + symbol.length * 0.6}rem` }}
      />
    </div>
  )
}
