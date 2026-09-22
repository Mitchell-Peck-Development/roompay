"use client"

import type { SetupAnchor, SetupWhere } from "@workspace/core"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { SectionCard } from "@/components/common/section-card"
import { SplitEditor } from "@/components/month/split-editor"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"
import type { TabId } from "@/lib/tabs"
import { AppearanceSection } from "./appearance-section"
import { BackupSection } from "./backup-section"
import { CadencesEditor } from "./cadences-editor"
import { CatchupSection } from "./catchup-section"
import { InstallSection } from "./install-section"
import { ItemsEditor } from "./items-editor"
import { PeopleEditor } from "./people-editor"
import { PrivacySection } from "./privacy-section"
import { SupportSection } from "./support-section"
import { SetupProgress } from "./setup-progress"

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "MXN", "INR", "JPY", "CHF", "SEK", "BRL"]

/** How long a section stays lit after the checklist sends you to it. */
const FLASH_MS = 2200

export function SetupTab({ onOpenTab }: { onOpenTab(tab: TabId): void }) {
  const data = useData()
  const people = data.people
    .filter((p) => !p.archived)
    .map((p) => ({ personId: p.id, nickname: p.nickname }))

  // Taking someone to a section they've never scrolled past is only half the
  // job: it has to be obvious which of the cards they landed on is the one.
  const [lit, setLit] = React.useState<SetupAnchor | null>(null)
  React.useEffect(() => {
    if (!lit) return
    const timer = setTimeout(() => setLit(null), FLASH_MS)
    return () => clearTimeout(timer)
  }, [lit])

  function go(where: SetupWhere) {
    if (where.tab !== "setup") {
      onOpenTab(where.tab)
      return
    }
    setLit(where.anchor)
    document
      .getElementById(`setup-${where.anchor}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const section = (anchor: SetupAnchor) => ({
    id: `setup-${anchor}`,
    className: cn(
      "scroll-mt-4 rounded-xl transition-shadow duration-300",
      lit === anchor && "ring-2 ring-primary ring-offset-4 ring-offset-background"
    ),
  })

  return (
    <>
      <div id="setup-progress" data-testid="setup-progress" className="scroll-mt-4 empty:hidden">
        <SetupProgress onGo={go} />
      </div>

      <div {...section("household")}>
        <SectionCard title="Household" description="A label for this place. It heads the share link, so pick something your roommates will recognise.">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="household-label">Label</Label>
              <Input
                id="household-label"
                className="h-10"
                value={data.household.label}
                maxLength={80}
                placeholder="Unit 3012"
                onChange={(e) => actions.setHousehold({ label: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="household-currency">Currency</Label>
              <Select value={data.household.currency} onValueChange={(currency) => actions.setHousehold({ currency })}>
                <SelectTrigger id="household-currency" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      </div>

      <div {...section("people")}>
        <PeopleEditor />
      </div>
      <div {...section("items")}>
        <ItemsEditor />
      </div>
      <div {...section("cadences")}>
        <CadencesEditor />
      </div>

      <div {...section("split")}>
        <SectionCard
          title="Default split"
          description="Where each new month starts. You can still change it month by month, or per line item."
        >
          <SplitEditor split={data.split} people={people} onChange={actions.setDefaultSplit} />
        </SectionCard>
      </div>

      <CatchupSection />
      <div {...section("backup")}>
        <BackupSection />
      </div>
      <InstallSection />
      <AppearanceSection />
      <PrivacySection />
      <SupportSection />
    </>
  )
}
