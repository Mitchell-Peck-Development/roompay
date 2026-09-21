import { CalendarDays, CalendarRange, History, ReceiptText, Settings2 } from "lucide-react"

/** The app's sections, in the order they sit in both navs. */
export const TABS = [
  { id: "bills", label: "Bills", icon: CalendarDays },
  { id: "month", label: "Month", icon: ReceiptText },
  { id: "catchup", label: "Catch-up", icon: CalendarRange },
  { id: "history", label: "History", icon: History },
  { id: "setup", label: "Setup", icon: Settings2 },
] as const

export type TabId = (typeof TABS)[number]["id"]

export const isTab = (value: string | null): value is TabId =>
  TABS.some((tab) => tab.id === value)
