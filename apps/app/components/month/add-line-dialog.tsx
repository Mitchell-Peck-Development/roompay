"use client"

import type { ItemSplit } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { Plus } from "lucide-react"
import * as React from "react"
import { MoneyInput } from "@/components/common/money-input"
import { actions } from "@/lib/actions"
import { CreditFields } from "./credit-editor"

type PersonRef = { personId: string; nickname: string }

/** A charge or credit that belongs to this month only. */
export function AddLineDialog({ people }: { people: PersonRef[] }) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [amount, setAmount] = React.useState<number | null>(null)
  const [sign, setSign] = React.useState<"charge" | "credit">("charge")
  const [who, setWho] = React.useState("default")
  // A credit lands somewhere; a charge is split. They're different questions.
  const [credit, setCredit] = React.useState<ItemSplit>({ mode: "default" })

  function reset() {
    setLabel("")
    setAmount(null)
    setSign("charge")
    setWho("default")
    setCredit({ mode: "default" })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!label.trim() || !amount) return
    const split: ItemSplit =
      sign === "credit"
        ? credit
        : who === "default"
          ? { mode: "default" }
          : who === "owner"
            ? { mode: "exclude" }
            : { mode: "only", personIds: [who] }
    actions.addOneOffLine({
      label,
      amountCents: sign === "credit" ? -Math.abs(amount) : Math.abs(amount),
      split,
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 self-start">
          <Plus /> Add one-time item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>One-time item</DialogTitle>
            <DialogDescription>
              Something that only applies this month — a repair, a shared
              purchase, or a credit for something a roommate already covered.
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            type="single"
            variant="outline"
            value={sign}
            onValueChange={(v) => (v === "charge" || v === "credit") && setSign(v)}
            className="w-full"
          >
            <ToggleGroupItem value="charge" className="h-9 flex-1">Charge</ToggleGroupItem>
            <ToggleGroupItem value="credit" className="h-9 flex-1">Credit</ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="one-off-label">What is it?</Label>
            <Input
              id="one-off-label"
              className="h-10"
              value={label}
              maxLength={80}
              placeholder={sign === "credit" ? "Groceries you covered" : "Plumber"}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="one-off-amount">Amount</Label>
            <MoneyInput id="one-off-amount" value={amount} onCommit={setAmount} />
          </div>
          {people.length > 0 && sign === "credit" && (
            <div className="flex flex-col gap-2">
              <Label>Where does it come off?</Label>
              <CreditFields split={credit} people={people} onChange={setCredit} idPrefix="one-off-credit" />
            </div>
          )}

          {people.length > 0 && sign === "charge" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="one-off-who">Who does it apply to?</Label>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger id="one-off-who" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Split like the rest of the bill</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.personId} value={p.personId}>
                      All {p.nickname}&apos;s
                    </SelectItem>
                  ))}
                  <SelectItem value="owner">Just me</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="submit"
              className="h-10"
              disabled={
                !label.trim() ||
                !amount ||
                (sign === "credit" &&
                  credit.mode === "only" &&
                  credit.personIds.length === 0)
              }
            >
              Add to this month
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
