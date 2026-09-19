"use client"

import { type MonthRecord, computeMonth, formatPeriod, isDirty } from "@workspace/core"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { FolderOpen, Trash2 } from "lucide-react"
import * as React from "react"
import { Amount } from "@/components/common/amount"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

type Pending = { action: "open" | "delete"; month: MonthRecord }

export function HistoryTab({ onOpen }: { onOpen(): void }) {
  const data = useData()
  const [pending, setPending] = React.useState<Pending | null>(null)
  const dirty = isDirty(data)
  const currentHasContent = data.current.lines.some((l) => l.amountCents !== null)

  function open(month: MonthRecord) {
    actions.openMonth(month.id)
    onOpen()
  }

  function requestOpen(month: MonthRecord) {
    if (month.id === data.current.id) return onOpen()
    // Don't silently throw away typing that was never saved to History.
    if (dirty && currentHasContent) setPending({ action: "open", month })
    else open(month)
  }

  function confirm() {
    if (!pending) return
    if (pending.action === "open") open(pending.month)
    else actions.deleteMonth(pending.month.id)
    setPending(null)
  }

  return (
    <SectionCard
      title="Saved months"
      description="Snapshots you chose to keep. They live on this device — export a backup from Setup to keep a copy elsewhere."
    >
      {data.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. On the Month tab, press <strong>Save month</strong> to keep a titled copy here.
          Publishing a month saves it too.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.months.map((month) => (
            <MonthItem
              key={month.id}
              month={month}
              isOpen={month.id === data.current.id}
              onOpen={() => requestOpen(month)}
              onDelete={() => setPending({ action: "delete", month })}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "delete" ? `Delete “${pending.month.title}”?` : "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "delete"
                ? "It's removed from this device. Anything already published to a roommate's link stays there until you unpublish it or it expires."
                : `“${data.current.title}” has changes that aren't saved to History. Opening another month replaces them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={pending?.action === "delete" ? "destructive" : "default"} onClick={confirm}>
              {pending?.action === "delete" ? "Delete" : "Open anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}

function MonthItem({
  month,
  isOpen,
  onOpen,
  onDelete,
}: {
  month: MonthRecord
  isOpen: boolean
  onOpen(): void
  onDelete(): void
}) {
  const computed = React.useMemo(() => computeMonth(month), [month])

  return (
    <li className="rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{formatPeriod(month.period)}</p>
          <p className="truncate font-heading text-base font-semibold">{month.title || formatPeriod(month.period)}</p>
        </div>
        <div className="text-right">
          <Amount cents={computed.totalCents} className="text-base font-semibold" />
          {isOpen && (
            <div>
              <Badge variant="secondary">open now</Badge>
            </div>
          )}
        </div>
      </div>

      {month.participants.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1 text-sm">
          {month.participants.map((p) => {
            const share = computed.totals[p.personId] ?? 0
            const paid = (month.paid[p.personId] ?? []).reduce((sum, e) => sum + e.amountCents, 0)
            return (
              <li key={p.personId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-muted-foreground">
                  {p.nickname || "Roommate"} · <Amount cents={share} />
                </span>
                <span className="flex items-center gap-1.5">
                  {month.published[p.personId] && <Badge variant="outline">shared</Badge>}
                  {share > 0 && paid >= share ? (
                    <Badge>paid</Badge>
                  ) : paid > 0 ? (
                    <Badge variant="secondary">
                      <Amount cents={paid} /> in
                    </Badge>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="h-9" onClick={onOpen}>
          <FolderOpen /> {isOpen ? "Go to month" : "Open"}
        </Button>
        <Button variant="ghost" className="h-9 text-muted-foreground" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </li>
  )
}
