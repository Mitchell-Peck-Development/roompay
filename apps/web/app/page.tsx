import { Button } from "@workspace/ui/components/button"
import { CalendarCheck, ListPlus, ShieldCheck } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"

const POINTS = [
  {
    icon: ListPlus,
    title: "Any bill, any split",
    body: "Rent, power, gas by the therm, a parking spot — set up the line items your place actually has, and split evenly, by percentage, or item by item.",
  },
  {
    icon: CalendarCheck,
    title: "Due dates in their calendar",
    body: "Offer pay-in-full, twice a month, or weekly. Your roommate picks one and adds the dates to their calendar in a tap.",
  },
  {
    icon: ShieldCheck,
    title: "No accounts, no names",
    body: "Everything stays on your device. A share link holds only the numbers you publish, and deletes itself when it's done.",
  },
]

export default function Page() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-12 px-4 py-16 sm:py-24">
      <section className="flex flex-col gap-5">
        <p className="eyebrow">RoomPay</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          Split the rent without the spreadsheet.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Work out what each roommate owes, give them a few ways to pay it across the month, and send them a link
          with the dates.
        </p>
        <div>
          <Button asChild size="lg" className="h-11 px-5 text-base">
            <a href={APP_URL}>Open RoomPay</a>
          </Button>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex flex-col gap-2">
            <Icon className="size-6 text-primary" aria-hidden />
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        RoomPay doesn&apos;t move money or store payment details. Pay each other however you already do.
      </p>
    </main>
  )
}
