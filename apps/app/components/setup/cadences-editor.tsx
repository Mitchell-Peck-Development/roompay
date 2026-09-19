"use client"

import { type Cadence, describeCadence, newId } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

type Draft = { id: string; name: string; days: string }

function parseDays(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 24) return null
  const days = parts.map(Number)
  return days.every((d) => Number.isInteger(d) && d >= 1 && d <= 31) ? days : null
}

export function CadencesEditor() {
  const data = useData()
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const days = draft ? parseDays(draft.days) : null

  const edit = (c: Cadence) => setDraft({ id: c.id, name: c.name, days: c.days.join(", ") })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || !days || !draft.name.trim()) return
    actions.upsertCadence({ id: draft.id, name: draft.name.trim(), days })
    setDraft(null)
  }

  return (
    <SectionCard
      title="Payment options"
      description="The ways a roommate can spread their share across the month. Each one is a set of due days."
      action={
        <Button variant="outline" className="h-9" onClick={() => setDraft({ id: newId(), name: "", days: "" })}>
          <Plus /> Add
        </Button>
      }
    >
      <ul className="flex flex-col divide-y">
        {data.cadences.map((cadence) => (
          <li key={cadence.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{cadence.name}</p>
              <p className="truncate text-xs text-muted-foreground">{describeCadence(cadence.days)}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Edit ${cadence.name}`} onClick={() => edit(cadence)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${cadence.name}`}
              disabled={data.cadences.length <= 1}
              onClick={() => actions.removeCadence(cadence.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          {draft && (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Payment option</DialogTitle>
                <DialogDescription>
                  The share is divided equally across the days you list. Days past the end of a short month move
                  to its last day.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cadence-name">Name</Label>
                <Input
                  id="cadence-name"
                  className="h-10"
                  value={draft.name}
                  maxLength={80}
                  placeholder="Every payday"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cadence-days">Due on these days of the month</Label>
                <Input
                  id="cadence-days"
                  className="tabular h-10"
                  inputMode="numeric"
                  value={draft.days}
                  placeholder="1, 15"
                  aria-invalid={draft.days.trim() !== "" && !days ? true : undefined}
                  onChange={(e) => setDraft({ ...draft, days: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {days ? describeCadence(days) : "Numbers from 1 to 31, separated by commas."}
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" className="h-10" disabled={!days || !draft.name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
