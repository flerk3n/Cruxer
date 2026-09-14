import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Keep browser requests same-origin by default. Vercel sets API_ORIGIN to the
    // Render service; direct NEXT_PUBLIC_API_URL remains available for previews.
    const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, "");
    return apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }] : [];
  }
};

export default nextConfig;
