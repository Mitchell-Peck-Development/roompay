import Link from "next/link"

export function LinkEnded({
  title = "This link has ended",
  children,
}: {
  title?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <p className="eyebrow">RoomPay</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col gap-3 text-pretty text-muted-foreground">
        {children ?? (
          <p>
            Share links delete themselves a couple of months after their last due date, and whoever sent it can
            remove it sooner. If you still need it, ask them to send a fresh one.
          </p>
        )}
      </div>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        What is RoomPay?
      </Link>
    </div>
  )
}
