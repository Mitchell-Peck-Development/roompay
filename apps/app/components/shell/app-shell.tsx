"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { CalendarDays, CalendarRange, History, ReceiptText, Settings2 } from "lucide-react"
import * as React from "react"
import { BillsTab } from "@/components/bills/bills-tab"
import { CatchupTab } from "@/components/catchup/catchup-tab"
import { HistoryTab } from "@/components/history/history-tab"
import { MonthTab } from "@/components/month/month-tab"
import { SetupTab } from "@/components/setup/setup-tab"
import { startPersistence, useData, useHydrated } from "@/lib/store"
import { FirstRun } from "./first-run"
import { InstallNudge } from "./install-nudge"
import { RecoveryNotice } from "./recovery-notice"

const TABS = [
  { id: "bills", label: "Bills", icon: CalendarDays },
  { id: "month", label: "Month", icon: ReceiptText },
  { id: "catchup", label: "Catch-up", icon: CalendarRange },
  { id: "history", label: "History", icon: History },
  { id: "setup", label: "Setup", icon: Settings2 },
] as const

export type TabId = (typeof TABS)[number]["id"]

const isTab = (value: string | null): value is TabId =>
  TABS.some((tab) => tab.id === value)

/** The tab lives in client state and is mirrored to ?tab= so reloads keep it. */
function useTab(): [TabId, (tab: TabId) => void] {
  // Safe to read the URL up front: nothing tab-specific renders until the
  // store has hydrated, which only happens after mount.
  const [tab, setTab] = React.useState<TabId>(() => {
    if (typeof window === "undefined") return "month"
    const fromUrl = new URLSearchParams(window.location.search).get("tab")
    return isTab(fromUrl) ? fromUrl : "month"
  })
  const change = React.useCallback((next: TabId) => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === "month") url.searchParams.delete("tab")
    else url.searchParams.set("tab", next)
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
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                tab === id && "bg-card text-foreground shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <RecoveryNotice />
      <InstallNudge />

      <main className="flex flex-col gap-4">
        {tab === "bills" && <BillsTab />}
        {tab === "month" && <MonthTab />}
        {tab === "catchup" && <CatchupTab />}
        {tab === "history" && <HistoryTab onOpen={() => setTab("month")} />}
        {tab === "setup" && <SetupTab />}
      </main>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Figures are estimates until the statement posts — reconcile against the
        actual bill each month.
      </footer>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium text-muted-foreground",
                tab === id && "text-primary"
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
