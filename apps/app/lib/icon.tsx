import { ImageResponse } from "next/og"

/**
 * The app icon — a bill split down the middle — rendered to PNG at any size.
 * `maskable` adds the safe-zone padding Android launchers crop into.
 */
export function iconResponse(size: number, options: { maskable?: boolean; rounded?: boolean } = {}) {
  const inset = options.maskable ? 0.2 : 0
  const glyph = size * (1 - inset * 2)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#25654c",
          borderRadius: options.rounded ? size * 0.22 : 0,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="28" fill="#f8f5ee" />
          <path d="M50 22a28 28 0 0 1 0 56z" fill="#9fd3b8" />
          <path d="M50 16v68" stroke="#25654c" strokeWidth="5" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
