"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import * as React from "react"
import { ReceivedLinks } from "@/components/roommate/received-links"
import { ImportBackupButton } from "@/components/setup/backup-section"
import { actions } from "@/lib/actions"

/** Shown until there's at least one roommate to split with. */
export function FirstRun() {
  const [household, setHousehold] = React.useState("")
  const [roommate, setRoommate] = React.useState("")

  function start(event: React.FormEvent) {
    event.preventDefault()
    if (!roommate.trim()) return
    actions.setHousehold({ label: household.trim() })
    actions.addPerson(roommate)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="eyebrow">Welcome</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">RoomPay</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Work out what each roommate owes, give them a few ways to pay it
          across the month, and hand them a link with the dates.
        </p>
      </div>

      <ReceivedLinks />

      <form onSubmit={start} className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="household">What should we call this place?</Label>
          <Input
            id="household"
            className="h-10"
            placeholder="Unit 3012, The Treehouse…"
            value={household}
            maxLength={80}
            onChange={(e) => setHousehold(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roommate">A nickname for your roommate</Label>
          <Input
            id="roommate"
            className="h-10"
            placeholder="Biscuit, Room B, anything…"
            value={roommate}
            maxLength={80}
            required
            onChange={(e) => setRoommate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            No real names needed — just something you&apos;ll both recognise.
            You can add more roommates later.
          </p>
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={!roommate.trim()}>
          Start splitting
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <p>
          No account. Everything you enter stays in this browser unless you
          choose to publish a share link.
        </p>
        <ImportBackupButton variant="link" label="Moving from another device? Import a backup" />
      </div>
    </div>
  )
}
