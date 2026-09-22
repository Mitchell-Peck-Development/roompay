import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { SUPPORT_URL } from "@/lib/support"
import { Mark, Wordmark } from "./mark"

/** Where the app lives. The landing page is "/" on the same origin. */
export const APP_PATH = "/app"

const NAV = [
  { href: "#timing", label: "How the dates work" },
  { href: "#steps", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-5">
        <a href="#top" className="rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50">
          <Wordmark />
          <span className="sr-only">RoomPay — back to top</span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <Button asChild size="lg" className="h-9 px-4">
          <Link href={APP_PATH}>Open RoomPay</Link>
        </Button>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-sm flex-col gap-2">
          <Mark className="size-6" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            RoomPay works out what each roommate owes and gives them the dates. It doesn&apos;t
            move money and never asks how you pay each other.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
          <Link href={APP_PATH} className="text-muted-foreground hover:text-foreground">
            Open RoomPay
          </Link>
          <a
            href="https://github.com/Mitchell-Peck-Development/roompay"
            className="text-muted-foreground hover:text-foreground"
          >
            Source on GitHub
          </a>
          <a href="#privacy" className="text-muted-foreground hover:text-foreground">
            What&apos;s stored, and where
          </a>
          {SUPPORT_URL && (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="support-link"
              className="text-muted-foreground hover:text-foreground"
            >
              Tip jar
            </a>
          )}
        </nav>
      </div>
    </footer>
  )
}
