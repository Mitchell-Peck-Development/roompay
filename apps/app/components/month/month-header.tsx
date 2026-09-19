"use client"

import { formatPeriod, isDirty } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Check, Save } from "lucide-react"
import { toast } from "sonner"
import { actions } from "@/lib/actions"
import { requestPersistentStorage } from "@/lib/durability"
import { useData } from "@/lib/store"
import { NewMonthDialog } from "./new-month-dialog"

export function MonthHeader() {
  const data = useData()
  const month = data.current
  const dirty = isDirty(data)

  function save() {
    actions.saveCurrent()
    void requestPersistentStorage()
    toast.success(`Saved “${month.title || formatPeriod(month.period)}” to History`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <p className="eyebrow">{formatPeriod(month.period)}</p>
        <input
          aria-label="Title for this month"
          value={month.title}
          maxLength={120}
          onChange={(e) => actions.setMonthTitle(e.target.value)}
          className="w-full truncate rounded-md bg-transparent font-heading text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder={formatPeriod(month.period)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9" variant={dirty ? "default" : "secondary"} disabled={!dirty} onClick={save}>
          {dirty ? <Save /> : <Check />}
          {dirty ? "Save month" : "Saved"}
        </Button>
        <NewMonthDialog />
        <p className="text-xs text-muted-foreground">
          {dirty ? "Autosaved on this device · not yet in History" : "In History"}
        </p>
      </div>
    </div>
  )
}
