import type { NextConfig } from "next";

/**
 * Baseline security headers for every response. `Referrer-Policy: no-referrer`
 * matters here: recording links are presigned, and opening one must never send
 * this dashboard's URL (which contains a call id) to the storage host.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
