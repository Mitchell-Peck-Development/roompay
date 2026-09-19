import { notFound } from "next/navigation"
import Link from "next/link"
import { LinkEnded } from "@/components/roommate/link-ended"
import { StatementView } from "@/components/roommate/statement-view"
import { findStatement, loadLink, shareMetadata } from "../load"

export const metadata = shareMetadata

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; period: string }>
  searchParams: Promise<{ kind?: string | string[] }>
}) {
  const { token, period } = await params
  const { kind } = await searchParams
  const { view, origin } = await loadLink(token)
  if (!view) notFound()

  const statement = findStatement(view, period, typeof kind === "string" ? kind : undefined)
  if (!statement) {
    return (
      <LinkEnded title="That statement isn't here any more">
        <p>It may have been replaced or removed by whoever sent it.</p>
        {view.statements.length > 0 && (
          <Link href={`/r/${token}`} className="text-primary underline-offset-4 hover:underline">
            See the latest one
          </Link>
        )}
      </LinkEnded>
    )
  }
  return <StatementView view={view} statement={statement} token={token} origin={origin} />
}
