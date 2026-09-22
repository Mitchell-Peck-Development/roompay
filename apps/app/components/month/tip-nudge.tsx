"use client"

import { Button } from "@workspace/ui/components/button"
import { Heart, X } from "lucide-react"
import { actions } from "@/lib/actions"
import { SUPPORT_URL } from "@/lib/support"

/**
 * The one moment the ask is honest: a link has just gone out, so the app has just done the
 * month's work. Whether it appears at all — and it only ever appears once — is
 * `shouldShowTipNudge`.
 */
export function TipNudge({ who }: { who: string }) {
  return (
    <aside className="relative rounded-xl bg-accent p-4 pr-10 text-sm text-accent-foreground">
      <button
        type="button"
        aria-label="Dismiss the tip jar"
        onClick={actions.dismissTipNudge}
        className="absolute top-2.5 right-2.5 rounded-md p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
      <p className="font-semibold">That&apos;s {who} sorted for the month.</p>
      <p className="mt-1 leading-relaxed opacity-90">
        RoomPay is free, has no paid tier and isn&apos;t getting one. If it&apos;s saved you a
        spreadsheet, there&apos;s a tip jar — and this is the only time it asks.
      </p>
      <Button asChild variant="outline" className="mt-3 h-9 bg-transparent">
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="support-link"
          onClick={actions.dismissTipNudge}
        >
          <Heart /> Leave a tip
        </a>
      </Button>
    </aside>
  )
}
