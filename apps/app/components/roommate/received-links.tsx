"use client"

import { ChevronRight, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { type ReceivedLink, forgetReceived, readReceived } from "@/lib/received"

/** Links this device has opened before — for a roommate landing on the home page. */
export function ReceivedLinks() {
  const [links, setLinks] = React.useState<ReceivedLink[]>([])
  React.useEffect(() => setLinks(readReceived()), [])
  if (links.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Links you&apos;ve opened</h2>
      <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {links.map((link) => (
          <li key={link.token} className="flex items-center">
            <Link href={`/r/${link.token}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{link.householdLabel || "RoomPay"}</span>
                {link.roommateLabel && (
                  <span className="block truncate text-xs text-muted-foreground">for {link.roommateLabel}</span>
                )}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
            <button
              type="button"
              aria-label="Forget this link"
              className="mr-2 rounded-md p-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                forgetReceived(link.token)
                setLinks(readReceived())
              }}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
