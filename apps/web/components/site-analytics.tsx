"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactUrl } from "@/lib/analytics";

/** Page analytics for every route, with query strings removed before they leave the browser. */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />;
}
