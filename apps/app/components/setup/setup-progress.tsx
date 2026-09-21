"use client"

import { type SetupStep, type SetupWhere, setupProgress } from "@workspace/core"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowRight, Check, PartyPopper } from "lucide-react"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { useData } from "@/lib/store"

/**
 * What's set up and what isn't, as a list you can leave and come back to.
 * Nothing here nags: each row says why the step matters and takes you to the
 * one place it's done, and the steps that are a judgement rather than a value
 * are ticked off by hand once they've been looked at.
 */
export function SetupProgress({ onGo }: { onGo(where: SetupWhere): void }) {
  const data = useData()
  const { steps, done, total, next, ready, complete } = setupProgress(data)

  if (complete) return null

  const required = steps.filter((s) => s.required)
  const optional = steps.filter((s) => !s.required)

  return (
    <SectionCard
      title={ready ? "Set up — here's what to do with it" : "Finish setting up"}
      description={
        ready
          ? "Everything the numbers depend on is in place. What's left is putting it to work."
          : "What's left before a month can be billed properly. Do it in one go or a bit at a time — this list keeps your place."
      }
      className={ready ? undefined : "ring-1 ring-primary/20"}
    >
      {!ready && (
        <div className="mb-4 flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              Next: <span className="text-primary">{next?.title}</span>
            </p>
            <p className="eyebrow shrink-0">
              {done} of {total}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.round((done / Math.max(1, total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y">
        {(ready ? optional : required).map((step) => (
          <StepRow
            key={step.id}
            step={step}
            isNext={step.id === next?.id}
            onGo={() => onGo(step.where)}
          />
        ))}
      </ul>

      {!ready && optional.some((s) => !s.done) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Then: {optional.filter((s) => !s.done).map((s) => s.title.toLowerCase()).join(", ")}.
        </p>
      )}

      {ready && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <PartyPopper className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This card goes away once the list is empty. Everything on it is still in Setup if you want to
          change your mind later.
        </p>
      )}
    </SectionCard>
  )
}

function StepRow({
  step,
  isNext,
  onGo,
}: {
  step: SetupStep
  isNext: boolean
  onGo(): void
}) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 shrink-0">
        {step.confirms ? (
          <Checkbox
            checked={step.done}
            aria-label={`${step.title} — checked`}
            onCheckedChange={(checked) => actions.setSetupReviewed(step.id, checked === true)}
          />
        ) : (
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full border",
              step.done ? "border-primary bg-primary text-primary-foreground" : "border-input"
            )}
            aria-hidden
          >
            {step.done && <Check className="size-3" />}
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", step.done && "text-muted-foreground")}>{step.title}</p>
        {!step.done && (
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{step.blurb}</p>
        )}
      </div>

      {!step.done && (
        <Button
          variant={isNext ? "default" : "outline"}
          className="h-8 shrink-0 px-2.5 text-xs"
          onClick={onGo}
        >
          {step.confirms ? "Look" : "Set up"} <ArrowRight />
        </Button>
      )}
    </li>
  )
}
