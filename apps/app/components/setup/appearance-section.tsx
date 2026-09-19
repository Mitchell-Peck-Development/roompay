"use client"

import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"
import { SectionCard } from "@/components/common/section-card"

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <SectionCard title="Appearance">
      <ToggleGroup
        type="single"
        variant="outline"
        value={mounted ? theme : undefined}
        onValueChange={(next) => next && setTheme(next)}
        className="w-full"
        aria-label="Theme"
      >
        <ToggleGroupItem value="system" className="h-9 flex-1"><Monitor /> System</ToggleGroupItem>
        <ToggleGroupItem value="light" className="h-9 flex-1"><Sun /> Light</ToggleGroupItem>
        <ToggleGroupItem value="dark" className="h-9 flex-1"><Moon /> Dark</ToggleGroupItem>
      </ToggleGroup>
    </SectionCard>
  )
}
