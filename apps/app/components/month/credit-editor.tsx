"use client"

import { type ItemSplit, OWNER } from "@workspace/core"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

type PersonRef = { personId: string; nickname: string }

/**
 * Where a credit lands. A credit isn't split like a charge — money is coming
 * back, and the only real question is whether it comes off the bill before
 * everyone's share is worked out, or off particular people's shares after.
 */
export function creditMode(split: ItemSplit): "bill" | "people" {
  return split.mode === "only" || split.mode === "roommates" ? "people" : "bill"
}

/** Which people a credit is aimed at, for the "after the split" case. */
export function creditRecipients(
  split: ItemSplit,
  people: PersonRef[]
): string[] {
  if (split.mode === "roommates") return people.map((p) => p.personId)
  if (split.mode === "only") return split.personIds.filter((id) => id !== OWNER)
  return []
}

export function describeCredit(split: ItemSplit, people: PersonRef[]): string {
  if (creditMode(split) === "bill") return "Off the whole bill"
  if (split.mode === "roommates") return "Off every roommate's share"
  const names = creditRecipients(split, people).map(
    (id) => people.find((p) => p.personId === id)?.nickname || "someone"
  )
  if (names.length === 0) return "Off nobody's share yet"
  if (names.length === 1) return `Off ${names[0]}'s share`
  return `Off ${names.slice(0, -1).join(", ")} and ${names.at(-1)}'s shares`
}

export function CreditFields({
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
  const mode = creditMode(split)
  const chosen = creditRecipients(split, people)
  const everyone = split.mode === "roommates"

  function toggle(personId: string, on: boolean) {
    // Once it's picked person by person it stops tracking the household.
    const next = on
      ? [...new Set([...chosen, personId])]
      : chosen.filter((id) => id !== personId)
    onChange({ mode: "only", personIds: next })
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={mode}
        onValueChange={(next) =>
          onChange(
            next === "bill"
              ? { mode: "default" }
              : // With one roommate, "every roommate" and their name are the
                // same thing, so it names them instead of asking twice.
                people.length === 1
                ? { mode: "only", personIds: [people[0]!.personId] }
                : { mode: "roommates" }
          )
        }
        className="gap-2.5"
      >
        <div className="flex items-start gap-2.5">
          <RadioGroupItem
            value="bill"
            id={`${idPrefix}-bill`}
            className="mt-0.5"
          />
          <Label
            htmlFor={`${idPrefix}-bill`}
            className="flex flex-col items-start gap-0.5 font-normal"
          >
            <span className="font-medium">Off the whole bill</span>
            <span className="text-xs text-muted-foreground">
              Before the split, so everyone&apos;s share drops.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2.5">
          <RadioGroupItem
            value="people"
            id={`${idPrefix}-people`}
            className="mt-0.5"
          />
          <Label
            htmlFor={`${idPrefix}-people`}
            className="flex flex-col items-start gap-0.5 font-normal"
          >
            <span className="font-medium">Off someone&apos;s share</span>
            <span className="text-xs text-muted-foreground">
              After the split, straight off their side. Yours doesn&apos;t
              change.
            </span>
          </Label>
        </div>
      </RadioGroup>

      {mode === "people" && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <p className="text-xs font-medium">Who gets it?</p>
          {people.length > 1 && (
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={everyone}
                onCheckedChange={(on) =>
                  onChange(
                    on ? { mode: "roommates" } : { mode: "only", personIds: [] }
                  )
                }
              />
              <span>
                Every roommate
                <span className="block text-xs text-muted-foreground">
                  Shared between them, and it follows the household as people
                  come and go.
                </span>
              </span>
            </label>
          )}
          {people.map((person) => (
            <label
              key={person.personId}
              className="flex items-center gap-2.5 text-sm"
            >
              <Checkbox
                checked={everyone || chosen.includes(person.personId)}
                disabled={everyone}
                onCheckedChange={(on) => toggle(person.personId, on === true)}
              />
              <span>{person.nickname || "Roommate"}</span>
            </label>
          ))}
          {people.length > 1 && !everyone && chosen.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Shared between the {chosen.length} of them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
