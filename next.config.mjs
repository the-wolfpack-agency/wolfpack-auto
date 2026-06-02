import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Pin output tracing to wolfpack-auto root — prevents Vercel from tracing
  // into parent mono repo and bloating serverless functions past 250MB
  outputFileTracingRoot: process.cwd(),
  // ESLint 8 + eslint-config-next 15 are incompatible (removed options).
  // TypeScript already enforces correctness; skip lint + TS during builds.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  env: {
    DEMO_MODE: process.env.DEMO_MODE || "",
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  async redirects() {
    return [
      /* The obvious /login URL was a dead 404 — admins live under
       *  /admin/login. Demo dealers who guess the canonical login path
       *  now land on the right page. */
      { source: "/login", destination: "/admin/login", permanent: false },
      { source: "/signin", destination: "/admin/login", permanent: false },

      /* Client-deployment polish: three intuitive paths previously 404'd.
       *  - /admin/dashboard was a holdover from an older nav; the real
       *    admin home is /admin.
       *  - /dealers (index) only resolves under /dealers/[slug] for a
       *    specific tenant; the marketing equivalent is /pricing.
       *  - /audits has sub-paths (/audits/fi-penetration, /audits/website)
       *    but no index — point visitors at the F&I audit landing page. */
      { source: "/admin/dashboard", destination: "/admin", permanent: false },
      { source: "/dealers", destination: "/pricing", permanent: false },
      { source: "/audits", destination: "/audits/fi-penetration", permanent: false },
    ];
  },

  async headers() {
    return [
      // -----------------------------------------------------------------------
      // RULE 1 — Global secure default (applied when __heatmap_bg is ABSENT).
      // X-Frame-Options: DENY + frame-ancestors 'none' prevent clickjacking
      // from any third-party origin. The `missing` condition guarantees this
      // rule does NOT apply when the preview param is present, making the two
      // rules mutually exclusive (one has the param, the other is missing it).
      // -----------------------------------------------------------------------
      {
        source: "/(.*)",
        missing: [{ type: "query", key: "__heatmap_bg" }],
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://images.unsplash.com",
              "font-src 'self'",
              "connect-src 'self' https://plausible.io https://*.plausible.io https://api.stripe.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io",
              "frame-src https://www.google.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
      // -----------------------------------------------------------------------
      // RULE 2 — Heatmap preview mode (applied ONLY when __heatmap_bg=1).
      // X-Frame-Options: SAMEORIGIN + frame-ancestors 'self' allow embedding
      // ONLY from the same origin (the admin heatmap page). Third-party
      // clickjacking is still blocked — we have not loosened to '*' or a
      // specific external host. All other security directives are identical
      // to Rule 1. Mutual exclusion: this rule requires the param; Rule 1
      // requires it to be absent, so both can never match the same request.
      // -----------------------------------------------------------------------
      {
        source: "/(.*)",
        has: [{ type: "query", key: "__heatmap_bg", value: "1" }],
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://images.unsplash.com",
              "font-src 'self'",
              "connect-src 'self' https://plausible.io https://*.plausible.io https://api.stripe.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io",
              "frame-src https://www.google.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry only when auth token is present (i.e. in CI/production).
// In local dev without credentials, the plain config is exported so the build
// never blocks on missing Sentry env vars.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: true,
    })
  : nextConfig;
