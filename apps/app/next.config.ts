import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/core"],
  // The development database ships a WASM Postgres; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        // A share link is a capability: keep it out of search engines and out
        // of the Referer header when someone clicks away from it.
        source: "/r/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ]
  },
}

export default nextConfig
