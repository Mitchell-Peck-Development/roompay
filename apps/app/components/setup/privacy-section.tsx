import { SectionCard } from "@/components/common/section-card"

export function PrivacySection() {
  return (
    <SectionCard title="What's stored, and where">
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">On this device:</strong> everything you type — line items,
          amounts, saved months, who has paid. There is no account, and none of it leaves your browser on its
          own.
        </p>
        <p>
          <strong className="text-foreground">On our server, only if you publish a link:</strong> a snapshot
          of that statement — line-item names and amounts, that roommate&apos;s share, the payment options and
          dates — plus the two labels you chose, and which option the roommate picked. It sits under a random
          link that only works for someone you&apos;ve sent it to.
        </p>
        <p>
          <strong className="text-foreground">Never:</strong> names, emails, phone numbers, or anything about
          how you pay each other. RoomPay doesn&apos;t move money.
        </p>
        <p>
          A link deletes itself 60 days after its last due date. You can delete one sooner from its menu on the
          Month tab, which also empties any calendar subscribed to it.
        </p>
      </div>
    </SectionCard>
  )
}
