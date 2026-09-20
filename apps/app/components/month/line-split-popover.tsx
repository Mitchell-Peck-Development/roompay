"use client"

import { type ItemSplit, OWNER } from "@workspace/core"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { PercentFields } from "@/components/common/percent-fields"

type PersonRef = { personId: string; nickname: string }

const OPTIONS: { mode: ItemSplit["mode"]; label: string; hint: string }[] = [
  { mode: "default", label: "Like the rest of the bill", hint: "Follows the month's split." },
  { mode: "even", label: "Evenly", hint: "Equal parts, whatever the month's split is." },
  { mode: "only", label: "Only some of us", hint: "Shared evenly between the people you pick." },
  { mode: "percent", label: "Custom %", hint: "For something mostly one person's." },
  { mode: "exclude", label: "Just me", hint: "Not shared with roommates." },
]

export function describeItemSplit(split: ItemSplit, people: PersonRef[]): string {
  switch (split.mode) {
    case "default":
      return "Usual split"
    case "even":
      return "Split evenly"
    case "exclude":
      return "Just me"
    case "roommates":
      return "All roommates"
    case "only": {
      const names = split.personIds.map((id) =>
        id === OWNER ? "you" : people.find((p) => p.personId === id)?.nickname || "someone"
      )
      if (names.length === 0) return "Nobody yet"
      if (names.length === 1) return `Only ${names[0]}`
      return `Only ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    }
    case "percent": {
      const parts = people
        .filter((p) => (split.pct[p.personId] ?? 0) > 0)
        .map((p) => `${p.nickname} ${split.pct[p.personId]}%`)
      return parts.length ? parts.join(", ") : "Just me"
    }
  }
}

/** The per-line split override, shared by the month view and item settings. */
export function ItemSplitFields({
  split,
  people,
  onChange,
  idPrefix,
}: {
  split: ItemSplit
  people: PersonRef[]
  onChange(split: ItemSplit): void
  idPrefix: string
}) {
  function setMode(mode: string) {
    if (mode === "percent") {
      onChange({ mode: "percent", pct: Object.fromEntries(people.map((p) => [p.personId, 0])) })
    } else if (mode === "only") {
      onChange({ mode: "only", personIds: [OWNER, ...people.map((p) => p.personId)] })
    } else if (mode === "default" || mode === "even" || mode === "exclude") {
      onChange({ mode })
    }
  }

  function toggleOnly(personId: string, on: boolean) {
    const current = split.mode === "only" ? split.personIds : []
    onChange({
      mode: "only",
      personIds: on ? [...new Set([...current, personId])] : current.filter((id) => id !== personId),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={split.mode} onValueChange={setMode} className="gap-2.5">
        {OPTIONS.map((option) => (
          <div key={option.mode} className="flex items-start gap-2.5">
            <RadioGroupItem value={option.mode} id={`${idPrefix}-${option.mode}`} className="mt-0.5" />
            <Label htmlFor={`${idPrefix}-${option.mode}`} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      {split.mode === "only" && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <p className="text-xs font-medium">Shared evenly between</p>
          {[{ personId: OWNER, nickname: "You" }, ...people].map((person) => (
            <label key={person.personId} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={split.personIds.includes(person.personId)}
                onCheckedChange={(on) => toggleOnly(person.personId, on === true)}
              />
              <span>{person.nickname || "Roommate"}</span>
            </label>
          ))}
        </div>
      )}

      {split.mode === "percent" && (
        <PercentFields
          people={people}
          pct={split.pct}
          onChange={(pct) => onChange({ mode: "percent", pct })}
        />
      )}
    </div>
  )
}

export function LineSplitPopover({
  lineId,
  split,
  people,
  onChange,
}: {
  lineId: string
  split: ItemSplit
  people: PersonRef[]
  onChange(split: ItemSplit): void
}) {
  return (
    <Popover>
      <PopoverTrigger className="rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        {describeItemSplit(split, people)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 text-sm font-medium">How is this one split?</p>
        <ItemSplitFields split={split} people={people} onChange={onChange} idPrefix={`split-${lineId}`} />
      </PopoverContent>
    </Popover>
  )
}
