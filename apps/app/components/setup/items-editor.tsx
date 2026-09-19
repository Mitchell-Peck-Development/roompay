"use client"

import { type ItemTemplate, formatMoney, isOffset, normalizeCoverage, ordinal } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { ArrowDown, ArrowUp, History, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { SectionCard } from "@/components/common/section-card"
import { describeItemSplit } from "@/components/month/line-split-popover"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"
import { ItemDialog, blankItem } from "./item-dialog"

function summary(item: ItemTemplate, currency: string): string {
  if (item.kind === "fixed") {
    return item.defaultAmountCents !== undefined
      ? `Fixed · ${formatMoney(item.defaultAmountCents, currency)}`
      : "Fixed"
  }
  if (item.kind === "metered") {
    const unit = item.meter?.unit || "unit"
    return item.meter?.rate ? `Metered · ${item.meter.rate} per ${unit}` : `Metered · per ${unit}`
  }
  return "From the statement"
}

/** "Covers last month" — the bit that decides who's actually on the hook. */
function coversLabel(item: ItemTemplate): string {
  const { offsetMonths, spanMonths } = normalizeCoverage(item.coverage)
  const back = offsetMonths === 1 ? "last month" : `${offsetMonths} months back`
  return spanMonths === 1 ? `Covers ${back}` : `Covers ${spanMonths} months, up to ${back}`
}

export function ItemsEditor() {
  const data = useData()
  const [editing, setEditing] = React.useState<ItemTemplate | null>(null)
  const people = data.people.filter((p) => !p.archived).map((p) => ({ personId: p.id, nickname: p.nickname }))

  return (
    <SectionCard
      title="Line items"
      description="What's on your bill. New months start from this list; changes here update the month you're working on too."
      action={
        <Button variant="outline" className="h-9" onClick={() => setEditing(blankItem())}>
          <Plus /> Add
        </Button>
      }
    >
      <ul className="flex flex-col divide-y">
        {data.items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`Move ${item.label} up`}
                disabled={index === 0}
                onClick={() => actions.moveItem(item.id, -1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Move ${item.label} down`}
                disabled={index === data.items.length - 1}
                onClick={() => actions.moveItem(item.id, 1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
            </div>
            <div className={`min-w-0 flex-1 ${item.enabled ? "" : "opacity-50"}`}>
              <p className="truncate text-sm font-medium">{item.label || "Untitled"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {summary(item, data.household.currency)}
                {item.dueDay !== undefined && ` · due the ${ordinal(item.dueDay)}`}
                {item.split.mode !== "default" && ` · ${describeItemSplit(item.split, people)}`}
              </p>
              {isOffset(item.coverage) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <History className="size-3 shrink-0" aria-hidden />
                  {coversLabel(item)}
                </p>
              )}
            </div>
            <Switch
              aria-label={`Include ${item.label} each month`}
              checked={item.enabled}
              onCheckedChange={(enabled) => actions.upsertItem({ ...item, enabled })}
            />
            <Button variant="ghost" size="icon" aria-label={`Edit ${item.label}`} onClick={() => setEditing(item)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${item.label}`} onClick={() => actions.removeItem(item.id)}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {data.items.length === 0 && (
          <li className="py-2 text-sm text-muted-foreground">No line items. Add one to get started.</li>
        )}
      </ul>
      <ItemDialog item={editing} onClose={() => setEditing(null)} />
    </SectionCard>
  )
}
