"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SectionCard } from "@/components/common/section-card"
import { SplitEditor } from "@/components/month/split-editor"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"
import { AppearanceSection } from "./appearance-section"
import { BackupSection } from "./backup-section"
import { CadencesEditor } from "./cadences-editor"
import { CatchupSection } from "./catchup-section"
import { InstallSection } from "./install-section"
import { ItemsEditor } from "./items-editor"
import { PeopleEditor } from "./people-editor"
import { PrivacySection } from "./privacy-section"

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "MXN", "INR", "JPY", "CHF", "SEK", "BRL"]

export function SetupTab() {
  const data = useData()
  const people = data.people
    .filter((p) => !p.archived)
    .map((p) => ({ personId: p.id, nickname: p.nickname }))

  return (
    <>
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

      <PeopleEditor />
      <ItemsEditor />
      <CadencesEditor />

      <SectionCard
        title="Default split"
        description="Where each new month starts. You can still change it month by month, or per line item."
      >
        <SplitEditor split={data.split} people={people} onChange={actions.setDefaultSplit} />
      </SectionCard>

      <CatchupSection />
      <BackupSection />
      <InstallSection />
      <AppearanceSection />
      <PrivacySection />
    </>
  )
}
