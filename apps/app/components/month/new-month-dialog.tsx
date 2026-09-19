"use client"

import { defaultPeriod, formatPeriod, isDirty, nextPeriod, prevPeriod } from "@workspace/core"
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
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react"
import * as React from "react"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

export function NewMonthDialog() {
  const data = useData()
  const [open, setOpen] = React.useState(false)
  const [period, setPeriod] = React.useState(() => defaultPeriod(new Date()))
  const dirty = isDirty(data)
  const hasContent = data.current.lines.some((l) => l.amountCents !== null || l.meter?.usage || l.meter?.curr)

  function onOpenChange(next: boolean) {
    if (next) {
      // Usually the month after the one on screen.
      const suggested = defaultPeriod(new Date())
      setPeriod(suggested > data.current.period ? suggested : nextPeriod(data.current.period))
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9">
          <FilePlus2 /> New month
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new month</DialogTitle>
          <DialogDescription>
            Fixed charges carry over, statement amounts start blank, and meter
            readings roll forward.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
          <Button variant="ghost" size="icon-lg" aria-label="Earlier month" onClick={() => setPeriod(prevPeriod(period))}>
            <ChevronLeft />
          </Button>
          <p className="font-heading text-lg font-semibold" aria-live="polite">
            {formatPeriod(period)}
          </p>
          <Button variant="ghost" size="icon-lg" aria-label="Later month" onClick={() => setPeriod(nextPeriod(period))}>
            <ChevronRight />
          </Button>
        </div>

        {dirty && hasContent && (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            “{data.current.title}” has changes that aren&apos;t saved to History.
            Save it first if you want to keep them.
          </p>
        )}

        <DialogFooter>
          {dirty && hasContent && (
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                actions.saveCurrent()
                actions.startNewMonth(period)
                setOpen(false)
              }}
            >
              Save, then start
            </Button>
          )}
          <Button
            className="h-10"
            onClick={() => {
              actions.startNewMonth(period)
              setOpen(false)
            }}
          >
            Start {formatPeriod(period)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
