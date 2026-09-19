import { ImageResponse } from "next/og"

export const alt =
  "RoomPay — split rent and bills with roommates. Every bill charged for the period it covers."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// The app's own palette, as literals: Satori resolves no CSS variables.
const PAPER = "#f8f5ee"
const INK = "#2b2721"
const GREEN = "#25654c"
const MINT = "#9fd3b8"
const MUTED = "#6f695f"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: 72,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 100 100">
            <rect width="100" height="100" rx="22" fill={GREEN} />
            <circle cx="50" cy="50" r="28" fill={PAPER} />
            <path d="M50 22a28 28 0 0 1 0 56z" fill={MINT} />
            <path d="M50 16v68" stroke={GREEN} strokeWidth="5" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>RoomPay</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Satori lays out flex children, not <br> — one div per line. */}
            {["Split the rent without", "the spreadsheet."].map((line) => (
              <div
                key={line}
                style={{ fontSize: 66, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}
              >
                {line}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 28, color: MUTED, lineHeight: 1.35, maxWidth: 880 }}>
            Every bill is charged for the period it covers — so the water bill that arrives today
            doesn&apos;t land on someone who moved in last week.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["Covers · who owes it", "Billed · the statement", "Due · when you pay"].map((chip) => (
            <span
              key={chip}
              style={{
                fontSize: 22,
                color: GREEN,
                background: "#e6f1ea",
                border: `1px solid ${MINT}`,
                borderRadius: 999,
                padding: "10px 22px",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    ),
    size
  )
}
