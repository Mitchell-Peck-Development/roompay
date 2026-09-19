import { notFound } from "next/navigation"
import { LinkEnded } from "@/components/roommate/link-ended"
import { RememberLink } from "@/components/roommate/remember-link"
import { StatementView } from "@/components/roommate/statement-view"
import { findStatement, loadLink, shareMetadata } from "./load"

export const metadata = shareMetadata

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { view, origin } = await loadLink(token)
  if (!view) notFound()

  const statement = findStatement(view)
  if (!statement) {
    return (
      <>
        <RememberLink token={token} householdLabel={view.link.householdLabel} roommateLabel={view.link.roommateLabel} />
        <LinkEnded title="Nothing here yet">
          <p>
            This link is set up, but nothing is published to it right now. When the next statement is ready it
            will appear here — and in your calendar, if you subscribed.
          </p>
        </LinkEnded>
      </>
    )
  }
  return <StatementView view={view} statement={statement} token={token} origin={origin} />
}
