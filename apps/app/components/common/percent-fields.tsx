"use client"

import { Input } from "@workspace/ui/components/input"
import { Slider } from "@workspace/ui/components/slider"
import * as React from "react"

type PersonRef = { personId: string; nickname: string }

const round2 = (n: number) => Math.round(n * 100) / 100
const trim = (n: number) => String(round2(n))

/**
 * One slider + number field per roommate. The owner always covers whatever is
 * left, so the roommates' shares are capped at 100% between them.
 */
export function PercentFields({
  people,
  pct,
  onChange,
}: {
  people: PersonRef[]
  pct: Record<string, number>
  onChange(pct: Record<string, number>): void
}) {
  const [capped, setCapped] = React.useState(false)
  const total = people.reduce((sum, p) => sum + (pct[p.personId] ?? 0), 0)

  function set(personId: string, raw: number) {
    const others = total - (pct[personId] ?? 0)
    const room = Math.max(0, round2(100 - others))
    const next = Math.min(Math.max(0, round2(raw)), room)
    setCapped(raw > room)
    onChange({ ...pct, [personId]: next })
  }

  return (
    <div className="flex flex-col gap-3">
      {people.map((p) => (
        <div key={p.personId} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm font-medium">{p.nickname || "Roommate"}</span>
          <Slider
            aria-label={`${p.nickname}'s share`}
            value={[pct[p.personId] ?? 0]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => set(p.personId, value ?? 0)}
            className="flex-1"
          />
          <PercentInput
            label={`${p.nickname}'s share, percent`}
            value={pct[p.personId] ?? 0}
            onCommit={(value) => set(p.personId, value)}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {capped
          ? "Shares can't add up to more than 100% — that one was capped."
          : `You cover the remaining ${trim(Math.max(0, 100 - total))}%.`}
      </p>
    </div>
  )
}

function PercentInput({
  value,
  onCommit,
  label,
}: {
  value: number
  onCommit(value: number): void
  label: string
}) {
  const [text, setText] = React.useState<string | null>(null)
  return (
    <div className="relative w-20 shrink-0">
      <Input
        aria-label={label}
        inputMode="decimal"
        className="tabular h-9 pr-6 text-right"
        value={text ?? trim(value)}
        onFocus={(e) => {
          setText(trim(value))
          e.currentTarget.select()
        }}
        onChange={(e) => {
          setText(e.target.value)
          const parsed = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed)
        }}
        onBlur={() => setText(null)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
        %
      </span>
    </div>
  )
}
