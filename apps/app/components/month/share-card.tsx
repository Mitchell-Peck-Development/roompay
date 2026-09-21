"use client"

import {
  type PaidEntry,
  type Published,
  type SharePayload,
  type StatementRef,
  paidTotal,
  payloadHash,
  pickPlan,
} from "@workspace/core"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import { Copy, ExternalLink, Link2Off, MoreHorizontal, RefreshCw, Send, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { Amount } from "@/components/common/amount"
import { SectionCard } from "@/components/common/section-card"
import { actions } from "@/lib/actions"
import { copyText, shareOrCopy } from "@/lib/download"
import { shareClient, shareErrorMessage } from "@/lib/share-client"
import { useData } from "@/lib/store"
import { SUPPORT_URL, shouldShowTipNudge } from "@/lib/support"
import { useLinkStatus } from "@/lib/use-link-status"
import { PaidTracker } from "./paid-tracker"
import { TipNudge } from "./tip-nudge"

type Props = {
  personId: string
  nickname: string
  statement: StatementRef
  period: string
  /** null when there's nothing to share (their share is zero). */
  payload: SharePayload | null
  published?: Published
  paid: PaidEntry[]
  /** Monthly statements are saved to History as they're published. */
  beforePublish?(): void
}

export function ShareCard({
  personId,
  nickname,
  statement,
  period,
  payload,
  published,
  paid,
  beforePublish,
}: Props) {
  const data = useData()
  const who = nickname || "your roommate"
  const link = data.links[personId]
  const { status, refresh } = useLinkStatus(link?.token)
  const [busy, setBusy] = React.useState(false)
  const [confirmRevoke, setConfirmRevoke] = React.useState(false)
  const [justPublished, setJustPublished] = React.useState(false)

  const hash = payload ? payloadHash(payload) : null
  const linkGone = Boolean(link && status && !status.ok)
  const remote = status?.ok
    ? status.statements.find((s) => s.period === period && s.kind === statement.kind)
    : undefined
  // Published from this device's point of view, unless the server says the
  // statement is no longer there (expired, or removed from another device).
  const isPublished = Boolean(link && published && !(status?.ok && !remote) && !linkGone)
  const changed = isPublished && hash !== null && hash !== published?.hash

  // What's been received lives on this device; the server keeps a copy of the
  // total so the roommate's calendar can say "Paid". Whenever the two differ —
  // a payment marked or undone, or marked while offline — send the local one.
  const receivedCents = paidTotal(paid)
  const remoteReceived = remote?.receivedCents
  const syncing = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!link || !isPublished || remoteReceived === undefined) return
    if (remoteReceived === receivedCents || syncing.current === receivedCents) return
    syncing.current = receivedCents
    void shareClient
      .received({ token: link.token, writeKey: link.writeKey, period, kind: statement.kind, receivedCents })
      .then((result) => {
        if (!result.ok && result.error !== "network") toast.error(shareErrorMessage(result.error, result.missing))
        return refresh()
      })
      .finally(() => {
        syncing.current = null
      })
  }, [link, isPublished, remoteReceived, receivedCents, period, statement.kind, refresh])

  const showTip = shouldShowTipNudge({
    savedMonths: data.months.length,
    dismissedAt: data.meta.tipNudgeDismissedAt,
    justPublished,
    supportUrl: SUPPORT_URL,
  })

  const url = link
    ? `${typeof window === "undefined" ? "" : window.location.origin}/r/${link.token}/${period}${
        statement.kind === "catchup" ? "?kind=catchup" : ""
      }`
    : ""

  async function publish(options: { share: boolean }) {
    if (!payload) return
    setBusy(true)
    beforePublish?.()
    const secrets = actions.ensureLink(personId)
    const result = await shareClient.publish({
      token: secrets.token,
      writeKey: secrets.writeKey,
      householdLabel: data.household.label,
      roommateLabel: nickname,
      payload,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(shareErrorMessage(result.error, result.missing))
      return
    }
    actions.setPublished(statement, personId, { at: new Date().toISOString(), hash: payloadHash(payload) })
    setJustPublished(true)
    void refresh()
    if (options.share) await share(secrets.token)
    else toast.success(`Link updated — ${who} will see the new numbers.`)
  }

  async function share(token = link?.token) {
    if (!token || !payload) return
    const target = `${window.location.origin}/r/${token}/${period}${statement.kind === "catchup" ? "?kind=catchup" : ""}`
    const outcome = await shareOrCopy({
      title: "RoomPay",
      text: `${payload.title} is ready on RoomPay — your share and the dates:`,
      url: target,
    })
    if (outcome === "copied") toast.success(`Link copied — send it to ${who}.`)
    if (outcome === "failed") toast.message("Published. Copy the link below to send it.")
  }

  async function unpublish() {
    if (!link || !payload) return
    setBusy(true)
    const result = await shareClient.unpublish({
      token: link.token,
      writeKey: link.writeKey,
      period,
      kind: statement.kind,
    })
    setBusy(false)
    if (!result.ok && result.error !== "not_found") return void toast.error(shareErrorMessage(result.error, result.missing))
    actions.setPublished(statement, personId, null)
    void refresh()
    toast.success("Removed from the link.")
  }

  async function revoke() {
    if (!link) return
    setBusy(true)
    const result = await shareClient.revoke({ token: link.token, writeKey: link.writeKey })
    setBusy(false)
    // If the server no longer knows the link, forgetting it locally is all that's left.
    if (!result.ok && result.error !== "not_found") return void toast.error(shareErrorMessage(result.error, result.missing))
    actions.forgetLink(personId)
    toast.success(`${who}'s link is gone, along with everything published to it.`)
  }

  const plan = payload
    ? pickPlan(payload, remote?.chosenPlan, status?.ok ? status.preferredPlan : null, payload.defaultPlan)
    : null

  return (
    <SectionCard
      title={`Share with ${who}`}
      description={
        isPublished
          ? "Same link every month — publishing just adds the new month to it."
          : "A read-only link with this statement, their share, the payment options, and one-tap calendar dates."
      }
      action={
        link ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Link options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={async () => {
                  if (await copyText(url)) toast.success("Link copied.")
                }}
              >
                <Copy /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.open(url, "_blank", "noopener")}>
                <ExternalLink /> See what {who} sees
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!isPublished} onSelect={unpublish}>
                <Link2Off /> Unpublish this statement
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRevoke(true)}>
                <Trash2 /> Delete {who}&apos;s link…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {!payload ? (
          <p className="text-sm text-muted-foreground">
            Nothing to share yet — {who}&apos;s share is <Amount cents={0} />. Enter this month&apos;s amounts first.
          </p>
        ) : linkGone ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              {who}&apos;s link has expired or was removed, so they can&apos;t open it any more.
            </p>
            <Button
              className="h-10 self-start"
              disabled={busy}
              onClick={() => {
                actions.forgetLink(personId)
                void publish({ share: true })
              }}
            >
              <Send /> Create a new link
            </Button>
          </div>
        ) : !isPublished ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Publishing stores this statement — its line items, amounts, {who}&apos;s share and the payment
              options — on RoomPay&apos;s server under a random, unguessable link, along with the two labels
              you chose. As you mark payments received, the running total is kept there too, so {who}&apos;s
              calendar can show what&apos;s paid. No account, no contact details, nothing about how you get
              paid. It deletes itself 60 days after the last due date, and you can delete it sooner from the
              menu above.
            </p>
            <Button className="h-11 self-start px-4" disabled={busy} onClick={() => publish({ share: true })}>
              <Send /> {busy ? "Publishing…" : "Publish & share"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                aria-label="Share link"
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="tabular h-10 min-w-0 flex-1 rounded-lg border bg-muted/50 px-3 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                data-testid="share-url"
              />
              <Button variant="outline" className="h-10" onClick={() => share()}>
                <Send /> Send
              </Button>
            </div>

            {changed ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft p-3">
                <p className="text-sm text-warning">The numbers changed since you published.</p>
                <Button className="h-9" disabled={busy} onClick={() => publish({ share: false })}>
                  <RefreshCw /> Update link
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Published {published ? new Date(published.at).toLocaleDateString() : ""} · up to date
              </p>
            )}

            <p className="text-sm" data-testid="pick-status">
              {remote?.chosenPlan && plan ? (
                <>
                  {who} picked <strong>{plan.name}</strong>.
                </>
              ) : (
                <span className="text-muted-foreground">
                  {who} hasn&apos;t picked a plan yet{plan ? ` — showing ${plan.name} until they do.` : "."}
                </span>
              )}
            </p>
          </div>
        )}

        {showTip && <TipNudge who={who} />}

        {payload && plan && (
          <>
            <Separator />
            <PaidTracker
              plan={plan}
              planNote={
                payload.plans.length === 1
                  ? "the schedule"
                  : remote?.chosenPlan
                    ? `picked by ${who}`
                    : "until they pick one"
              }
              entries={paid}
              statement={statement}
              personId={personId}
            />
          </>
        )}
      </div>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {who}&apos;s link?</AlertDialogTitle>
            <AlertDialogDescription>
              Every month published to it is removed from the server, the link stops working, and any calendar
              subscribed to it empties out. Your own records stay on this device. Publishing again will create
              a brand-new link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={revoke}>
              Delete link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}
