import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Security headers (Phase 1). Applied to every response. The CSP is pragmatic
// rather than nonce-strict: Next.js streams flight payloads as inline scripts,
// and 'unsafe-eval' is required by the PDF.js worker and dev tooling. All
// other policies are strict (no frames, no remote origins, no 3rd-party
// navigations), and production upgrades any http to https.
// ---------------------------------------------------------------------------
const isProd = process.env.NODE_ENV === "production";
const supabaseOrigin = process.env.SUPABASE_URL ?? "";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "object-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval'",
  "script-src-attr 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  `connect-src 'self' blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""} https://*.blob.vercel-storage.com https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com`,
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Enables `use cache` + `cacheLife` function-level caching (Next 16 Cache
  // Components). The (app) layout reads cookies on every request, so all app
  // routes stay dynamic; PPR shells are therefore minimal.
  cacheComponents: true,
  // The official OSAS master DOCX templates are read from disk at runtime
  // (src/lib/docx/forms.ts). Ship them inside the export route's serverless
  // bundle so DOCX generation works on deployed/hosted runtimes.
  outputFileTracingIncludes: {
    "/api/org/[id]/documents/[form]/export": ["./templates/osas/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security" as const,
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
  // Allow LAN devices (phone/tablet) to open the dev server by IP.
  // DHCP reassigns addresses, so whitelist both known hosts of this network.
  allowedDevOrigins: ["192.168.1.2", "192.168.1.11"],
  experimental: {
    // Attachment uploads are posted through server actions; leave room for
    // multipart overhead above the 10 MB file cap.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
