"use client"

import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"

/** Picks whose numbers are on screen. Hidden when there's only one roommate. */
export function RoommateSwitcher({
  people,
  value,
  onChange,
}: {
  people: { personId: string; nickname: string }[]
  value: string
  onChange(personId: string): void
}) {
  if (people.length < 2) return null
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      className="flex w-full flex-wrap"
      aria-label="Roommate"
    >
      {people.map((p) => (
        <ToggleGroupItem key={p.personId} value={p.personId} className="h-9 flex-1 px-3">
          {p.nickname || "Roommate"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
