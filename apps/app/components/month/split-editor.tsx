"use client"

import type { Split } from "@workspace/core"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { PercentFields } from "@/components/common/percent-fields"

type PersonRef = { personId: string; nickname: string }

/** Even split vs. custom percentages. Used for a month and for the default. */
export function SplitEditor({
  split,
  people,
  onChange,
}: {
  split: Split
  people: PersonRef[]
  onChange(split: Split): void
}) {
  const each = Math.round((100 / (people.length + 1)) * 10) / 10

  function setMode(mode: string) {
    if (mode === "even") onChange({ mode: "even" })
    if (mode === "percent") {
      // Start custom percentages from wherever the even split was.
      const start = Math.floor(100 / (people.length + 1))
      onChange({
        mode: "percent",
        pct: Object.fromEntries(people.map((p) => [p.personId, start])),
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        value={split.mode}
        onValueChange={(mode) => mode && mode !== split.mode && setMode(mode)}
        aria-label="How the bill is split"
        className="w-full"
      >
        <ToggleGroupItem value="even" className="h-9 flex-1">
          Split evenly
        </ToggleGroupItem>
        <ToggleGroupItem value="percent" className="h-9 flex-1">
          Custom %
        </ToggleGroupItem>
      </ToggleGroup>

      {split.mode === "even" ? (
        <p className="text-xs text-muted-foreground">
          {people.length === 0
            ? "Add a roommate to split with."
            : `${people.length + 1} people, about ${each}% each. Odd cents land on you.`}
        </p>
      ) : (
        <PercentFields
          people={people}
          pct={split.pct}
          onChange={(pct) => onChange({ mode: "percent", pct })}
        />
      )}
    </div>
  )
}
