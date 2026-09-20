"use client"

import { formatPeriod, periodOf, todayISO } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { DateField } from "@/components/common/date-field"
import { MoneyInput } from "@/components/common/money-input"
import { ReceivedLinks } from "@/components/roommate/received-links"
import { ImportBackupButton } from "@/components/setup/backup-section"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

type Roommate = { nickname: string; movedIn: string | null }

const STEPS = ["place", "roommates", "bills"] as const
type Step = (typeof STEPS)[number]

/**
 * Setting up, in three short steps. It asks for move-in dates up front because
 * that's what decides whether someone owes a full month or part of one — and
 * it's the moment a catch-up makes sense to offer, rather than leaving it to
 * be stumbled on in a tab.
 */
export function FirstRun() {
  const data = useData()
  const [step, setStep] = React.useState<Step>("place")
  const [household, setHousehold] = React.useState("")
  const [roommates, setRoommates] = React.useState<Roommate[]>([{ nickname: "", movedIn: null }])
  const [rentCents, setRentCents] = React.useState<number | null>(null)

  const named = roommates.filter((r) => r.nickname.trim())
  const thisMonth = periodOf(todayISO())

  function finish() {
    actions.setHousehold({ label: household.trim() })

    const partial: { id: string; nickname: string; movedIn: string }[] = []
    for (const roommate of named) {
      const id = actions.addPerson(roommate.nickname)
      if (roommate.movedIn) {
        actions.setPersonResidency(id, { from: roommate.movedIn })
        // Mid-month arrivals owe part of this month; that's a catch-up.
        if (periodOf(roommate.movedIn) === thisMonth && !roommate.movedIn.endsWith("-01")) {
          partial.push({ id, nickname: roommate.nickname.trim(), movedIn: roommate.movedIn })
        }
      }
    }

    if (rentCents !== null) {
      const rent = data.items.find((item) => item.label === "Rent")
      if (rent) actions.upsertItem({ ...rent, defaultAmountCents: rentCents })
    }

    for (const person of partial) {
      actions.ensureCatchup(person.id, person.movedIn)
    }
  }

  const back = STEPS.indexOf(step) > 0 && (
    <Button
      variant="ghost"
      className="h-9 self-start px-2 text-muted-foreground"
      onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1]!)}
    >
      <ArrowLeft /> Back
    </Button>
  )

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div>
        <p className="eyebrow">Setting up · {STEPS.indexOf(step) + 1} of 3</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {step === "place" && "What should we call this place?"}
          {step === "roommates" && "Who are you splitting with?"}
          {step === "bills" && "What does the place cost?"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {step === "place" &&
            "A label you'll both recognise. It heads the link you send, and nothing here is tied to your name."}
          {step === "roommates" &&
            "Nicknames only. If you know when someone moved in, say so — it decides whether they owe a full month or only part of one."}
          {step === "bills" &&
            "Rent, a service fee, trash, sewer, water and power are set up for you. Put in the rent now and fill the rest in from the statement each month."}
        </p>
      </div>

      {step === "place" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setStep("roommates")
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="household">Name of the place</Label>
            <Input
              id="household"
              className="h-11"
              placeholder="Unit 3012, The Treehouse…"
              value={household}
              maxLength={80}
              autoFocus
              onChange={(event) => setHousehold(event.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-11">
            Next
          </Button>
        </form>
      )}

      {step === "roommates" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (named.length > 0) setStep("bills")
          }}
        >
          <ul className="flex flex-col gap-4">
            {roommates.map((roommate, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                <div className="flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Label htmlFor={`roommate-${index}`}>Nickname</Label>
                    <Input
                      id={`roommate-${index}`}
                      className="h-11"
                      placeholder="Biscuit, Room B…"
                      value={roommate.nickname}
                      maxLength={80}
                      autoFocus={index > 0}
                      onChange={(event) =>
                        setRoommates((list) =>
                          list.map((r, i) => (i === index ? { ...r, nickname: event.target.value } : r))
                        )
                      }
                    />
                  </div>
                  {roommates.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remove roommate ${index + 1}`}
                      onClick={() => setRoommates((list) => list.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`moved-in-${index}`} className="text-xs text-muted-foreground">
                    Moved in (leave empty if they&apos;ve always been here)
                  </Label>
                  <DateField
                    id={`moved-in-${index}`}
                    value={roommate.movedIn ?? ""}
                    clearable
                    onChange={(value) =>
                      setRoommates((list) =>
                        list.map((r, i) => (i === index ? { ...r, movedIn: value } : r))
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="h-10 self-start"
            onClick={() => setRoommates((list) => [...list, { nickname: "", movedIn: null }])}
          >
            <Plus /> Add another
          </Button>
          <Button type="submit" size="lg" className="h-11" disabled={named.length === 0}>
            Next
          </Button>
          {back}
        </form>
      )}

      {step === "bills" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            finish()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rent">Rent each month</Label>
            <MoneyInput id="rent" className="w-40" value={rentCents} onCommit={setRentCents} />
          </div>
          <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            Water, sewer and power are set to bill a month behind, the way most utilities do — so a roommate
            only pays for the days they were actually here. You can change any of that in Setup.
          </p>
          <Button type="submit" size="lg" className="h-11">
            <Check /> Start {formatPeriod(thisMonth)}
          </Button>
          {back}
        </form>
      )}

      <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <ReceivedLinks />
        <p>
          No account. Everything you enter stays in this browser unless you choose to publish a share link.
        </p>
        <ImportBackupButton variant="link" label="Moving from another device? Import a backup" />
      </div>
    </div>
  )
}
