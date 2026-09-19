import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Unchanged on purpose: the id is the installed app's identity, so
    // moving it from "/" to "/app" would look like a different app and
    // install a second copy alongside anyone's existing one.
    id: "/",
    name: "RoomPay",
    short_name: "RoomPay",
    description: "Split rent and bills with roommates. No accounts — your numbers stay on your device.",
    // The landing page is "/" now; the app itself lives under "/app", and
    // share links at "/r/..." are deliberately outside scope — they belong to
    // the roommate, and should open in the browser rather than the owner's
    // installed app.
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f6f1",
    theme_color: "#f8f6f1",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
