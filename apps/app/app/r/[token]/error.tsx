"use client"

import { Button } from "@workspace/ui/components/button"

/** Shown when the link couldn't be loaded — not when it doesn't exist. */
export default function ShareError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <p className="eyebrow">RoomPay</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Couldn&apos;t load this right now</h1>
      <p className="text-pretty text-muted-foreground">
        Your link is fine — the server just didn&apos;t answer. Give it a moment and try again.
      </p>
      <Button className="h-10 self-start" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
