import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Keep browser requests same-origin. Vercel sets this server-only variable
    // to the Render service; it is intentionally not NEXT_PUBLIC_API_URL.
    const configuredOrigin = process.env.API_ORIGIN?.trim();
    const apiOrigin = configuredOrigin ? new URL(configuredOrigin).origin : undefined;
    return apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }] : [];
  }
};

export default nextConfig;
