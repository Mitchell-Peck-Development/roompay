"use client"

import { Button } from "@workspace/ui/components/button"
import { Share, SquarePlus, X } from "lucide-react"
import { toast } from "sonner"
import { exportBackup } from "@/components/setup/backup-section"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"
import { useInstall } from "@/lib/use-install"

/**
 * Safari clears a site's storage after a week of not visiting it — and this
 * is a once-a-month tool. Home Screen apps are exempt, so iPhone users get
 * nudged to install early, before there's much to lose.
 */
export function InstallNudge() {
  const { meta } = useData()
  const install = useInstall()

  if (!install.ready || install.standalone || meta.installNudgeDismissedAt) return null
  const ios = install.platform === "ios"
  if (!ios && !install.canPrompt) return null

  return (
    <aside className="relative mb-4 rounded-xl bg-accent p-4 pr-10 text-sm text-accent-foreground">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={actions.dismissInstallNudge}
        className="absolute top-2.5 right-2.5 rounded-md p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
      {ios ? (
        <>
          <p className="font-semibold">Keep your numbers safe: add RoomPay to your Home Screen</p>
          <p className="mt-1 leading-relaxed opacity-90">
            Safari clears a site&apos;s saved data if you don&apos;t visit for a week. Installed apps are
            exempt. Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" />, then{" "}
            <span className="whitespace-nowrap">
              <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> Add to Home Screen
            </span>
            . The installed app starts empty, so export a backup first and import it there.
          </p>
          <Button
            variant="outline"
            className="mt-3 h-9 bg-transparent"
            onClick={async () => {
              const outcome = await exportBackup()
              if (outcome === "downloaded") toast.success("Backup saved.")
            }}
          >
            Export backup first
          </Button>
        </>
      ) : (
        <>
          <p className="font-semibold">Install RoomPay</p>
          <p className="mt-1 leading-relaxed opacity-90">
            Opens like an app, works offline, and keeps your saved months out of the browser&apos;s cleanup.
          </p>
          <Button className="mt-3 h-9" onClick={() => void install.prompt()}>
            Install
          </Button>
        </>
      )}
    </aside>
  )
}
