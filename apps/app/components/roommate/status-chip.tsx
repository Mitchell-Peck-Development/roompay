import { type PaymentStatus, STATUS_LABEL } from "@workspace/core"
import { cn } from "@workspace/ui/lib/utils"

const TONE: Record<PaymentStatus, string> = {
  future: "text-muted-foreground",
  pending: "text-warning",
  pay_now: "bg-warning-soft text-warning",
  overdue: "bg-destructive/10 text-destructive",
  paid: "bg-accent text-accent-foreground",
}

/** The same words the roommate's subscribed calendar uses. */
export function StatusChip({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 text-[0.625rem] leading-4 font-semibold tracking-wide uppercase",
        TONE[status],
        className
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
