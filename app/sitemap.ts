import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${baseUrl}/black-market`, changeFrequency: "daily" as const, priority: 1 }];
}
