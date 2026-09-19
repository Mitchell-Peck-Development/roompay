import { History } from "lucide-react"

/**
 * September's statement as the app actually renders it — the same rows, the
 * same "covers" line, the same arithmetic. Static markup rather than a
 * screenshot, so it stays sharp, themes with the page and reads to a screen
 * reader as the table it is.
 */
const ROWS = [
  { label: "Rent", covers: "September", amount: "1,648.00", share: "824.00" },
  { label: "Service fee", covers: "September", amount: "6.00", share: "3.00" },
  { label: "Trash disposal", covers: "September", amount: "20.00", share: "10.00" },
  { label: "Sewer", covers: "August", offset: true, amount: "38.00", share: "0.00" },
  { label: "Water", covers: "August", offset: true, amount: "38.00", share: "0.00" },
  { label: "Power", covers: "August", offset: true, amount: "160.00", share: "0.00" },
]

export function StatementPreview() {
  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-card shadow-xl ring-1 shadow-foreground/5 ring-foreground/10">
        <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4">
          <div>
            <p className="eyebrow">September 2026</p>
            <p className="font-heading text-lg font-semibold tracking-tight">Unit 3012</p>
          </div>
          <p className="eyebrow">Biscuit</p>
        </div>

        <table className="w-full text-sm">
          <caption className="sr-only">
            September&apos;s bills, what each covers, and Biscuit&apos;s share
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="eyebrow px-5 py-2 text-left font-normal">
                Bill
              </th>
              <th scope="col" className="eyebrow py-2 text-right font-normal">
                Total
              </th>
              <th scope="col" className="eyebrow px-5 py-2 text-right font-normal">
                Theirs
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-dashed last:border-0">
                <th scope="row" className="px-5 py-2.5 text-left align-top font-normal">
                  {row.label}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {row.offset && <History className="size-3 shrink-0" aria-hidden />}
                    covers {row.covers}
                  </span>
                </th>
                <td className="tabular py-2.5 text-right align-top text-muted-foreground">
                  ${row.amount}
                </td>
                <td
                  className={`tabular px-5 py-2.5 text-right align-top font-medium ${
                    row.share === "0.00" ? "text-muted-foreground" : ""
                  }`}
                >
                  ${row.share}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-baseline justify-between gap-4 bg-accent px-5 py-3 text-accent-foreground">
          <p className="text-sm font-medium">Biscuit&apos;s share</p>
          <p className="tabular text-2xl font-bold text-primary">$837.00</p>
        </div>
      </div>

      <figcaption className="px-1 text-xs leading-relaxed text-muted-foreground">
        Biscuit moved in on 1 September. The water, sewer and power bills that landed this month are
        August&apos;s — so they&apos;re the owner&apos;s, and Biscuit&apos;s share is half of what
        actually covers September.
      </figcaption>
    </figure>
  )
}
