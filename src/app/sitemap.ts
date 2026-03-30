import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://wolfpack-auto.vercel.app";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/inventory`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/financing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/trade-in`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/service-booking`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];
}
