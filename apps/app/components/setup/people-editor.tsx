"use client"

import { canRemovePerson } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react"
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
      description="Nicknames suggested — a pet name, a room, an initial. They appear on the share link and nowhere else."
    >
      <ul className="flex flex-col gap-2">
        {data.people.map((person) => (
          <li key={person.id} className="flex items-center gap-2">
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
