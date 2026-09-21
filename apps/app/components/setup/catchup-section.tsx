"use client"

import { formatPeriod, isCatchingUp } from "@workspace/core"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { CalendarRange, EyeOff, Wand2 } from "lucide-react"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

/**
 * Most months nobody is settling in, and the Catch-up tab is dead weight.
 * On auto it appears for the months a move-in actually touches — and can be
 * pinned on or off for households that would rather decide for themselves.
 */
export function CatchupSection() {
  const data = useData()
  const pref = data.prefs?.catchupTab ?? "auto"
  const period = data.current.period
  const active = isCatchingUp(data, period)

  return (
    <SectionCard
      title="Catch-up tab"
      description="Where a new roommate's first, part-paid months are worked out. It's only useful while someone is moving in."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={pref}
        onValueChange={(next) => {
          if (next === "off" || next === "auto" || next === "on") {
            actions.setCatchupTabPref(next)
          }
        }}
        className="w-full"
        aria-label="Show the Catch-up tab"
      >
        <ToggleGroupItem value="off" className="h-9 flex-1">
          <EyeOff /> Off
        </ToggleGroupItem>
        <ToggleGroupItem value="auto" className="h-9 flex-1">
          <Wand2 /> Auto
        </ToggleGroupItem>
        <ToggleGroupItem value="on" className="h-9 flex-1">
          <CalendarRange /> On
        </ToggleGroupItem>
      </ToggleGroup>

      <p className="mt-3 text-sm text-muted-foreground">
        {pref === "auto" ? (
          <>
            Shown from the month before someone moves in until the last bill covering their first
            months has landed, and while a catch-up is still being paid off.{" "}
            <strong className="font-medium text-foreground">
              {active
                ? `Showing for ${formatPeriod(period)}.`
                : `Hidden for ${formatPeriod(period)} — nobody is settling in.`}
            </strong>
          </>
        ) : pref === "on" ? (
          "Always in the tab bar, whether or not anyone is settling in."
        ) : (
          "Never in the tab bar. Months a catch-up already covers still say so on the Month tab."
        )}
      </p>
    </SectionCard>
  )
}
