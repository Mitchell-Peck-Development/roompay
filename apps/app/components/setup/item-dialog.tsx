"use client"

import {
  type Coverage,
  type ItemTemplate,
  SAME_MONTH,
  describeCoverage,
  newId,
  normalizeCoverage,
  ordinal,
} from "@workspace/core"
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
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import * as React from "react"
import { MoneyInput } from "@/components/common/money-input"
import { ItemSplitFields } from "@/components/month/line-split-popover"
import { actions } from "@/lib/actions"
import { currencySymbol } from "@/lib/format"
import { useData } from "@/lib/store"

const KINDS: { kind: ItemTemplate["kind"]; label: string; hint: string }[] = [
  { kind: "fixed", label: "Fixed", hint: "Same most months — rent, a flat fee. Prefilled for you." },
  { kind: "variable", label: "From the statement", hint: "Changes monthly — you type the amount in." },
  { kind: "metered", label: "Metered", hint: "Usage × a rate, plus an optional base fee — gas by the therm, a sub-meter." },
]

const UNITS = ["kWh", "therm", "CCF", "gal", "m³"]

/** How far behind the service a bill arrives — the usual suspects. */
const OFFSETS = [
  { months: 0, label: "This month", hint: "Rent, fees — paid for the month it's billed in." },
  { months: 1, label: "Last month", hint: "Most utilities: the bill that lands now is last month's usage." },
  { months: 2, label: "2 months back", hint: "Slow municipal billing — water and sewer often run this far behind." },
] as const

export function blankItem(): ItemTemplate {
  return {
    id: newId(),
    label: "",
    kind: "variable",
    enabled: true,
    split: { mode: "default" },
    coverage: SAME_MONTH,
  }
}

export function ItemDialog({
  item,
  onClose,
}: {
  /** The template being edited, or a blank one for "add". null = closed. */
  item: ItemTemplate | null
  onClose(): void
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        {item && <ItemForm key={item.id} initial={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ItemForm({ initial, onClose }: { initial: ItemTemplate; onClose(): void }) {
  const data = useData()
  const [draft, setDraft] = React.useState(initial)
  const isNew = !data.items.some((t) => t.id === initial.id)
  const people = data.people.filter((p) => !p.archived).map((p) => ({ personId: p.id, nickname: p.nickname }))
  const meter = draft.meter ?? { unit: "kWh", rate: "", baseFeeCents: 0, input: "usage" as const }
  const coverage: Coverage = normalizeCoverage(draft.coverage)
  const patch = (next: Partial<ItemTemplate>) => setDraft((d) => ({ ...d, ...next }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.label.trim()) return
    const item: ItemTemplate = { ...draft, label: draft.label.trim(), coverage }
    if (item.kind === "metered") item.meter = meter
    else delete item.meter
    if (item.kind !== "fixed") delete item.defaultAmountCents
    actions.upsertItem(item)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{isNew ? "New line item" : "Edit line item"}</DialogTitle>
        <DialogDescription>
          Anything that shows up on the bill: rent, gas, internet, parking, a pet fee.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-label">Name</Label>
        <Input
          id="item-label"
          className="h-10"
          value={draft.label}
          maxLength={80}
          placeholder="Internet"
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>How does it work?</Label>
        <RadioGroup
          value={draft.kind}
          onValueChange={(kind) => patch({ kind: kind as ItemTemplate["kind"] })}
          className="gap-2.5"
        >
          {KINDS.map((k) => (
            <div key={k.kind} className="flex items-start gap-2.5">
              <RadioGroupItem value={k.kind} id={`kind-${k.kind}`} className="mt-0.5" />
              <Label htmlFor={`kind-${k.kind}`} className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">{k.label}</span>
                <span className="text-xs text-muted-foreground">{k.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-2">
          <Label>What period does the bill cover?</Label>
          <p className="text-xs text-muted-foreground">
            Bills rarely pay for the month they arrive in. Getting this right is what keeps a
            roommate off a bill for service from before they moved in.
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(coverage.offsetMonths)}
            onValueChange={(value) =>
              value && patch({ coverage: { ...coverage, offsetMonths: Number(value) } })
            }
            className="w-full"
          >
            {OFFSETS.map((option) => (
              <ToggleGroupItem
                key={option.months}
                value={String(option.months)}
                className="h-9 flex-1 text-xs"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            {OFFSETS.find((o) => o.months === coverage.offsetMonths)?.hint ??
              describeCoverage(coverage)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-span">Months per bill</Label>
            <Input
              id="item-span"
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              className="tabular h-10"
              value={coverage.spanMonths}
              onChange={(e) =>
                patch({
                  coverage: normalizeCoverage({
                    ...coverage,
                    spanMonths: Number(e.target.value) || 1,
                  }),
                })
              }
            />
            <span className="text-xs text-muted-foreground">
              {coverage.spanMonths > 1 ? "A quarterly or seasonal bill." : "One month at a time."}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-due-day">Usually due on the…</Label>
            <Input
              id="item-due-day"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              placeholder="—"
              className="tabular h-10"
              value={draft.dueDay ?? ""}
              onChange={(e) => {
                const day = Number(e.target.value)
                patch({ dueDay: day >= 1 && day <= 31 ? day : undefined })
              }}
            />
            <span className="text-xs text-muted-foreground">
              {draft.dueDay
                ? `Lands on the ${ordinal(draft.dueDay)} in the Bills calendar.`
                : "Optional — puts it on the Bills calendar."}
            </span>
          </div>
        </div>
      </div>

      {draft.kind === "fixed" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-default">Usual amount</Label>
          <MoneyInput
            id="item-default"
            className="w-40"
            value={draft.defaultAmountCents ?? null}
            onCommit={(cents) => patch({ defaultAmountCents: cents ?? undefined })}
          />
        </div>
      )}

      {draft.kind === "metered" && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-unit">Unit</Label>
              <Input
                id="item-unit"
                className="h-10"
                list="item-units"
                value={meter.unit}
                maxLength={16}
                onChange={(e) => patch({ meter: { ...meter, unit: e.target.value } })}
              />
              <datalist id="item-units">
                {UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-rate">
                Rate ({currencySymbol(data.household.currency)} per {meter.unit || "unit"})
              </Label>
              <Input
                id="item-rate"
                inputMode="decimal"
                className="tabular h-10 text-right"
                value={meter.rate}
                placeholder="0.13456"
                onChange={(e) => patch({ meter: { ...meter, rate: e.target.value } })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-base">Base fee each month</Label>
            <MoneyInput
              id="item-base"
              className="w-40"
              value={meter.baseFeeCents === 0 ? null : meter.baseFeeCents}
              onCommit={(cents) => patch({ meter: { ...meter, baseFeeCents: cents ?? 0 } })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Each month you&apos;ll enter…</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={meter.input}
              onValueChange={(input) =>
                (input === "usage" || input === "readings") && patch({ meter: { ...meter, input } })
              }
              className="w-full"
            >
              <ToggleGroupItem value="usage" className="h-9 flex-1">The usage</ToggleGroupItem>
              <ToggleGroupItem value="readings" className="h-9 flex-1">Meter readings</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              With readings, last month&apos;s reading carries forward automatically.
            </p>
          </div>
        </div>
      )}

      {people.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Who shares it?</Label>
          <ItemSplitFields
            split={draft.split}
            people={people}
            onChange={(split) => patch({ split })}
            idPrefix={`item-${draft.id}`}
          />
        </div>
      )}

      <DialogFooter>
        <Button type="submit" className="h-10" disabled={!draft.label.trim()}>
          {isNew ? "Add item" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
