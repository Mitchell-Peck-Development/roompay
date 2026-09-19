import type { MetadataRoute } from "next"

const SITE_URL = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/+$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "monthly", priority: 1 }]
}
