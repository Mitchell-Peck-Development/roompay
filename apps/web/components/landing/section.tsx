import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

/** The page's one horizontal rhythm — every band lines up on this. */
export function Band({
  children,
  className,
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    // Anchored bands clear the sticky header when jumped to.
    <section id={id} className={cn("border-t py-16 sm:py-24", id && "scroll-mt-14", className)}>
      <div className="mx-auto w-full max-w-5xl px-5">{children}</div>
    </section>
  )
}

export function Heading({
  eyebrow,
  title,
  lead,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  lead?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="text-lg leading-relaxed text-pretty text-muted-foreground">{lead}</p>}
    </div>
  )
}
