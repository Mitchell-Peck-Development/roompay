/** The app icon: a bill split down the middle. */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <rect width="100" height="100" rx="22" className="fill-primary" />
      <circle cx="50" cy="50" r="28" className="fill-background" />
      <path d="M50 22a28 28 0 0 1 0 56z" className="fill-primary/35" />
      <path d="M50 16v68" strokeWidth="5" className="stroke-primary" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark className="size-6" />
      <span className="font-heading text-lg font-semibold tracking-tight">RoomPay</span>
    </span>
  )
}
