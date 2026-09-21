import { Button } from "@workspace/ui/components/button"
import { Heart } from "lucide-react"
import { SUPPORT_URL } from "@/lib/support"
import { Band, Heading } from "./section"

/**
 * Why a tool this useful is free, answered before anyone has to wonder what the catch is. It
 * follows the privacy section's argument: that one says RoomPay takes nothing from you, this
 * one says how it survives anyway.
 */
export function SupportBand() {
  if (!SUPPORT_URL) return null

  return (
    <Band id="support" className="bg-muted/40">
      <div className="flex max-w-3xl flex-col items-start gap-6">
        <Heading
          eyebrow="Why it's free"
          title="No accounts, no ads, no paid tier."
          lead="There's no roommate limit waiting behind a paywall, and no plan to add one. Working out the split is the whole product, and it stays free — the only thing that costs anything is the server that holds a published link for its sixty days."
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          So if RoomPay saved you an argument this month, there&apos;s a tip jar. It&apos;s
          entirely optional, nothing about the app changes either way, and it isn&apos;t
          mentioned again once you&apos;ve been.
        </p>
        <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" data-testid="support-link">
            <Heart /> Leave a tip
          </a>
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The link hands you over to Ko-fi. RoomPay sends nothing with you — not your numbers, not
          even which page you came from.
        </p>
      </div>
    </Band>
  )
}
