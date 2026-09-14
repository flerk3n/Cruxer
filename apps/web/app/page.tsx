import { LandingHero } from "@/components/landing-hero";
import { SiteHeader } from "@/components/site-header";

export default function Home() { return <><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 rounded-lg bg-surface px-3 py-2">Skip to content</a><SiteHeader /><main id="main"><LandingHero /></main></>; }
