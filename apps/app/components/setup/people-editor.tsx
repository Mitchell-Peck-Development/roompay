"use client"

import { type Person, canRemovePerson, isISODate } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Archive, ArchiveRestore, CalendarDays, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

export function PeopleEditor() {
  const data = useData()
  const [nickname, setNickname] = React.useState("")

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!nickname.trim()) return
    actions.addPerson(nickname)
    setNickname("")
  }

  return (
    <SectionCard
      title="Roommates"
      description="Nicknames only — a pet name, a room, an initial. They appear on the share link and nowhere else."
    >
      <ul className="flex flex-col gap-2">
        {data.people.map((person) => (
          <li key={person.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Nickname"
                className="h-10"
                value={person.nickname}
                maxLength={80}
                disabled={person.archived}
                onChange={(e) => actions.renamePerson(person.id, e.target.value)}
              />
              {person.archived ? (
                <Button variant="outline" className="h-10" onClick={() => actions.setPersonArchived(person.id, false)}>
                  <ArchiveRestore /> Restore
                </Button>
              ) : canRemovePerson(data, person.id) ? (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Remove ${person.nickname}`}
                  onClick={() => actions.removePerson(person.id)}
                >
                  <Trash2 />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Archive ${person.nickname}`}
                  title="Moved out? Archiving keeps their history."
                  onClick={() => actions.setPersonArchived(person.id, true)}
                >
                  <Archive />
                </Button>
              )}
            </div>
            {!person.archived && <Residency person={person} />}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          aria-label="New roommate's nickname"
          className="h-10"
          placeholder="Add a roommate…"
          value={nickname}
          maxLength={80}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Button type="submit" variant="outline" className="h-10" disabled={!nickname.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </SectionCard>
  )
}

/**
 * Residency is what makes an offset bill land on the right person: every
 * line is weighted by the days of its service window someone was here for,
 * so an August water bill skips a roommate who arrived in September.
 */
function Residency({ person }: { person: Person }) {
  const [open, setOpen] = React.useState(Boolean(person.from || person.to))
  const set = (key: "from" | "to") => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (value === "") actions.setPersonResidency(person.id, { [key]: null })
    else if (isISODate(value)) actions.setPersonResidency(person.id, { [key]: value })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start pl-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        <CalendarDays className="size-3.5" aria-hidden />
        Set when {person.nickname || "they"} moved in or out
      </button>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`from-${person.id}`} className="text-xs text-muted-foreground">
          Moved in
        </Label>
        <Input
          id={`from-${person.id}`}
          type="date"
          className="tabular h-10"
          value={person.from ?? ""}
          onChange={set("from")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`to-${person.id}`} className="text-xs text-muted-foreground">
          Moving out
        </Label>
        <Input
          id={`to-${person.id}`}
          type="date"
          className="tabular h-10"
          min={person.from}
          value={person.to ?? ""}
          onChange={set("to")}
        />
      </div>
      <p className="col-span-2 text-xs text-muted-foreground">
        Leave these empty if they&apos;ve always been here. Otherwise every bill is weighted by
        the days of the period it covers that they were — including bills that arrive a month late.
      </p>
    </div>
  )
}
