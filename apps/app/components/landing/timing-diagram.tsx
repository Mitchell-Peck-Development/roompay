/**
 * The three dates a bill has, on one timeline. This is the idea the whole
 * product turns on, so it gets a picture rather than a paragraph.
 *
 * The shapes do the teaching: coverage is a *band* across the month it pays
 * for, while billed and due are *points* on the axis. Built as a grid of
 * three months rather than an SVG so it reflows on a phone, themes with the
 * page, and scales with the reader's font size.
 */
const MONTHS = [
  { name: "August", mark: null },
  { name: "September", mark: { label: "Billed", detail: "the statement lands" } },
  { name: "October", mark: { label: "Due", detail: "the money leaves" } },
] as const

export function TimingDiagram() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid grid-cols-3 gap-2 text-center">
          {MONTHS.map(({ name }) => (
            <p key={name} className="eyebrow truncate">
              {name}
            </p>
          ))}
        </div>

        {/* A period, not a point: the band sits across the month it pays for. */}
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <div className="flex h-10 items-center justify-center rounded-lg bg-primary px-2 text-center text-xs font-semibold text-primary-foreground">
            Covers
          </div>
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
          the service it pays for
        </p>

        {/* The axis, with a point on each month that has a date on it. */}
        <div className="relative mt-5">
          <div className="absolute inset-x-0 top-[0.3125rem] h-px bg-border" aria-hidden />
          <div className="relative grid grid-cols-3 gap-2">
            {MONTHS.map(({ name, mark }) => (
              <div key={name} className="flex flex-col items-center gap-2">
                <span
                  className={`size-2.5 rounded-full border-2 bg-card ${
                    mark ? "border-primary" : "border-border"
                  }`}
                  aria-hidden
                />
                {mark && (
                  <div className="w-full rounded-lg border bg-card px-2 py-1.5 text-center">
                    <p className="text-xs font-semibold">{mark.label}</p>
                    <p className="text-[0.6875rem] leading-tight text-muted-foreground">
                      {mark.detail}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 border-t pt-4 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Only “covers” decides who owes it.</span>{" "}
          A roommate who arrived in September owes none of this bill. One who was here for half of
          August owes half of their share — counted in whole days, so the split still adds up to
          the cent.
        </p>
      </div>

      <figcaption className="sr-only">
        A timeline across August, September and October. The bill covers the whole of August, is
        billed in September, and is due in October.
      </figcaption>
    </figure>
  )
}
