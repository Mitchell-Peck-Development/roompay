"use client"

import { Button } from "@workspace/ui/components/button"
import { TriangleAlert, X } from "lucide-react"
import { saveFile } from "@/lib/download"
import { useStore } from "@/lib/store"

const CORRUPT_KEY = "roompay:v1:corrupt"

/**
 * Shown when part of the saved data couldn't be read on the way in. The
 * original is still in this browser, so it offers to save a copy of it before
 * the repaired version is written back over it.
 */
export function RecoveryNotice() {
  const recovery = useStore((s) => s.recovery)
  const clear = useStore((s) => s.clearRecovery)
  if (!recovery) return null

  async function saveOriginal() {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(CORRUPT_KEY)
    } catch {
      // Nothing more we can do; the button just won't produce a file.
    }
    if (raw) await saveFile("roompay-unreadable-data.json", raw)
  }

  return (
    <aside className="relative mb-4 rounded-xl bg-warning-soft p-4 pr-10 text-sm text-warning">
      <button
        type="button"
        aria-label="Dismiss the data notice"
        onClick={clear}
        className="absolute top-2.5 right-2.5 rounded-md p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {recovery.fresh ? "Your saved data couldn't be read" : "Part of your saved data couldn't be read"}
      </p>
      <p className="mt-1 leading-relaxed">
        {recovery.fresh
          ? "RoomPay has started fresh. "
          : `Everything else was kept. Skipped: ${recovery.dropped.join(", ")}. `}
        A copy of the original is still in this browser — save it before you make changes, and send it along if
        you&apos;d like it looked at.
      </p>
      <Button variant="outline" className="mt-3 h-9 bg-transparent" onClick={saveOriginal}>
        Save a copy of the original
      </Button>
    </aside>
  )
}
