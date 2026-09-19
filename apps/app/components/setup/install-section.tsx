"use client"

import { Button } from "@workspace/ui/components/button"
import { SectionCard } from "@/components/common/section-card"
import { useInstall } from "@/lib/use-install"

const STEPS = {
  ios: "In Safari, tap the Share button, then “Add to Home Screen”. The installed app has its own storage and starts empty — export a backup here first, then import it there.",
  mac: "In Safari: File → Add to Dock. In Chrome or Edge: the install icon at the right of the address bar.",
  android: "In Chrome: the ⋮ menu → “Add to Home screen” or “Install app”.",
  windows: "In Chrome or Edge: the install icon at the right of the address bar.",
  other: "Look for “Install” or “Add to Home Screen” in your browser's menu.",
} as const

export function InstallSection() {
  const install = useInstall()
  if (!install.ready) return null

  return (
    <SectionCard
      title="Install as an app"
      description="Opens full-screen, works offline, and — importantly on iPhone — stops Safari from clearing your saved months after a week away."
    >
      {install.standalone ? (
        <p className="text-sm text-primary">You&apos;re using the installed app.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{STEPS[install.platform]}</p>
          {install.canPrompt && (
            <Button className="h-10 self-start" onClick={() => void install.prompt()}>
              Install RoomPay
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  )
}
