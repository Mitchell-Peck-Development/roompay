import { Button } from "@workspace/ui/components/button"
import { Heart } from "lucide-react"
import { SectionCard } from "@/components/common/section-card"
import { SUPPORT_URL } from "@/lib/support"

/**
 * Last in Setup, right after Privacy, because the two are one argument: RoomPay takes nothing
 * from you, and this is how it exists anyway.
 */
export function SupportSection() {
  if (!SUPPORT_URL) return null

  return (
    <SectionCard
      title="Support RoomPay"
      description="No accounts, no ads and no paid tier — not now, and not later. Tips are what pay for the server that holds your share links."
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Entirely optional, and nothing about the app changes either way. The link opens Ko-fi;
          RoomPay sends nothing with you, not even which page you came from.
        </p>
        <Button asChild variant="outline" className="h-10 self-start">
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" data-testid="support-link">
            <Heart /> Leave a tip
          </a>
        </Button>
      </div>
    </SectionCard>
  )
}
