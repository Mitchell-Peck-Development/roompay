"use client"

import { type AppData, backupFilename, makeBackup, parseBackup } from "@workspace/core"
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
import { Button } from "@workspace/ui/components/button"
import { Download, Upload } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { saveFile } from "@/lib/download"
import { daysAgo } from "@/lib/format"
import { useData, useStore } from "@/lib/store"

export async function exportBackup() {
  const now = new Date()
  const backup = makeBackup(useStore.getState().data, now)
  const outcome = await saveFile(backupFilename(now), JSON.stringify(backup, null, 2))
  if (outcome !== "cancelled") actions.markBackup()
  return outcome
}

/** File picker → validate → ask whether to replace or merge. */
export function ImportBackupButton({
  label = "Import a backup",
  variant = "outline",
}: {
  label?: string
  variant?: "outline" | "link"
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const [incoming, setIncoming] = React.useState<AppData | null>(null)
  const hasData = useData().people.length > 0

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) return void toast.error(parsed.error)
    // Nothing here yet? There's nothing to merge with — just load it.
    if (!hasData) {
      actions.importData(parsed.data, "replace")
      return void toast.success("Backup loaded.")
    }
    setIncoming(parsed.data)
  }

  function finish(mode: "replace" | "merge") {
    if (!incoming) return
    actions.importData(incoming, mode)
    setIncoming(null)
    toast.success(mode === "merge" ? "Backup merged with what was here." : "Backup loaded.")
  }

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={onFile} tabIndex={-1} />
      <Button
        type="button"
        variant={variant}
        className={variant === "link" ? "h-auto p-0 text-xs" : "h-10"}
        onClick={() => input.current?.click()}
      >
        {variant === "outline" && <Upload />}
        {label}
      </Button>

      <AlertDialog open={incoming !== null} onOpenChange={(open) => !open && setIncoming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace or merge?</AlertDialogTitle>
            <AlertDialogDescription>
              The backup has {incoming?.months.length ?? 0} saved month(s) and {incoming?.people.length ?? 0}{" "}
              roommate(s). <strong>Merge</strong> keeps what&apos;s on this device and adds what&apos;s missing;
              where both have the same month, the most recently edited one wins. <strong>Replace</strong> swaps
              everything here for the backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => finish("replace")}>
              Replace
            </AlertDialogAction>
            <AlertDialogAction onClick={() => finish("merge")}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function BackupSection() {
  const { meta } = useData()
  const last = meta.lastBackupAt ? daysAgo(meta.lastBackupAt) : null

  return (
    <SectionCard
      title="Backup & moving devices"
      description="Your data lives only in this browser. Export a file to keep a copy, or to carry everything to another device."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-10"
            onClick={async () => {
              const outcome = await exportBackup()
              if (outcome === "downloaded") toast.success("Backup saved to your downloads.")
            }}
          >
            <Download /> Export backup
          </Button>
          <ImportBackupButton />
        </div>
        <p className="text-xs text-muted-foreground">
          {last === null
            ? "No backup yet."
            : last === 0
              ? "Last backup: today."
              : `Last backup: ${last} day${last === 1 ? "" : "s"} ago.`}{" "}
          The file includes the keys that control your share links, so keep it somewhere private.
        </p>
      </div>
    </SectionCard>
  )
}
