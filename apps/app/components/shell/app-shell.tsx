"use client"

import { setupProgress, showCatchupTab } from "@workspace/core"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { ListChecks } from "lucide-react"
import * as React from "react"
import { BillsTab } from "@/components/bills/bills-tab"
import { CatchupTab } from "@/components/catchup/catchup-tab"
import { HistoryTab } from "@/components/history/history-tab"
import { MonthTab } from "@/components/month/month-tab"
import { SetupTab } from "@/components/setup/setup-tab"
import { startPersistence, useData, useHydrated } from "@/lib/store"
import { TABS, type TabId, isTab } from "@/lib/tabs"
import { FirstRun } from "./first-run"
import { InstallNudge } from "./install-nudge"
import { RecoveryNotice } from "./recovery-notice"

/**
 * The tab lives in client state and is mirrored to ?tab= so reloads keep it.
 * Null means nobody has picked one — the URL didn't name a tab and this visit
 * hasn't switched — which is what lets the app choose where to open without
 * writing a tab into the address bar that the visitor never asked for.
 */
function useTab(): [TabId | null, (tab: TabId) => void] {
  // Safe to read the URL up front: nothing tab-specific renders until the
  // store has hydrated, which only happens after mount.
  const [tab, setTab] = React.useState<TabId | null>(() => {
    if (typeof window === "undefined") return null
    const fromUrl = new URLSearchParams(window.location.search).get("tab")
    return isTab(fromUrl) ? fromUrl : null
  })
  const change = React.useCallback((next: TabId) => {
    setTab(next)
    // Every tab is written down, the Month tab included: a reload should put
    // you back where you were, not where the app would have opened.
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url)
    window.scrollTo({ top: 0 })
  }, [])
  return [tab, change]
}

export function AppShell() {
  const hydrated = useHydrated()
  const data = useData()
  const [tab, setTab] = useTab()

  React.useEffect(() => startPersistence(), [])

  // Half-finished setup decides where the app opens: the Month tab looks like
  // the place to set things up, but what's typed there belongs to that month
  // alone. Setup is where the numbers that carry forward live.
  const progress = setupProgress(data)
  const landing: TabId = progress.ready ? "month" : "setup"

  // The Catch-up tab only earns its place while someone is settling in —
  // unless Setup says otherwise. Everything else is always there.
  const catchup = showCatchupTab(data, data.current.period)
  const tabs = React.useMemo(
    () => TABS.filter((t) => t.id !== "catchup" || catchup),
    [catchup]
  )
  // A tab that has just gone away can't stay open behind its own nav entry.
  const chosen = tab ?? landing
  const open: TabId = tabs.some((t) => t.id === chosen) ? chosen : "month"

  if (!hydrated) return <ShellSkeleton />
  if (data.people.length === 0) return <FirstRun />

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-32 sm:pb-16">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow truncate">{data.household.label || "Your household"}</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">RoomPay</h1>
        </div>
        <nav aria-label="Sections" className="hidden rounded-xl bg-muted p-1 sm:flex">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={open === id ? "page" : undefined}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                open === id && "bg-card text-foreground shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <RecoveryNotice />
      <InstallNudge />

      {!progress.ready && open !== "setup" && (
        <button
          type="button"
          onClick={() => setTab("setup")}
          className="mb-4 flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3 text-left text-accent-foreground ring-1 ring-primary/20"
        >
          <ListChecks className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              Finish setting up · {progress.done} of {progress.total}
            </span>
            <span className="block truncate text-xs">Next: {progress.next?.title}</span>
          </span>
          <span className="shrink-0 text-xs font-medium underline underline-offset-4">Continue</span>
        </button>
      )}

      <main className="flex flex-col gap-4">
        {open === "bills" && <BillsTab />}
        {open === "month" && (
          <MonthTab onOpenCatchup={catchup ? () => setTab("catchup") : undefined} />
        )}
        {open === "catchup" && <CatchupTab />}
        {open === "history" && <HistoryTab onOpen={() => setTab("month")} />}
        {open === "setup" && <SetupTab onOpenTab={setTab} />}
      </main>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Figures are estimates until the statement posts — reconcile against the
        actual bill each month.
      </footer>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <div
          className={cn(
            "mx-auto grid max-w-2xl",
            tabs.length === 5 ? "grid-cols-5" : "grid-cols-4"
          )}
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={open === id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium text-muted-foreground",
                open === id && "text-primary"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="mb-6 h-9 w-40" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
