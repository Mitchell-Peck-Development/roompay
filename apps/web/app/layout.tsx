import type { Metadata } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
const display = Fraunces({ subsets: ["latin"], variable: "--font-display" })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
const TITLE = "RoomPay — split rent and bills with roommates"
const DESCRIPTION =
  "Work out what each roommate owes, offer a few ways to pay it across the month, and send them a link with the due dates. Every bill is charged for the period it covers. No accounts."

export const metadata: Metadata = {
  // Resolves the generated Open Graph image to an absolute URL.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "RoomPay",
  openGraph: {
    type: "website",
    siteName: "RoomPay",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans antialiased", sans.variable, mono.variable, display.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
