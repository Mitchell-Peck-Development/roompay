"use client"

import { isISODate } from "@workspace/core"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

type Props = {
  id?: string
  value: string | undefined
  onChange(value: string | null): void
  /** A required field snaps back to its last good value if left empty. */
  clearable?: boolean
  min?: string
  max?: string
  className?: string
  "aria-label"?: string
}

/**
 * A date field that behaves while you're typing. A native date input reports
 * half-typed and cleared values as "", and a controlled field that ignores
 * those fights the person: the day snaps back as they reach for the month,
 * and a date can't be cleared at all. This keeps what's on screen until it's
 * either a real date or the field is left empty.
 */
export function DateField({ value, onChange, clearable = false, className, ...props }: Props) {
  const [typed, setTyped] = React.useState<string | null>(null)
  const shown = typed ?? value ?? ""

  return (
    <Input
      {...props}
      type="date"
      className={cn("tabular h-11 w-full", className)}
      value={shown}
      onChange={(event) => {
        const next = event.target.value
        setTyped(next)
        if (isISODate(next)) onChange(next)
        else if (next === "" && clearable) onChange(null)
      }}
      onBlur={() => setTyped(null)}
    />
  )
}
