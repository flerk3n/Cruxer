import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CruxerLogo } from "@/components/cruxer-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return <header className="page-frame flex h-20 items-center justify-between" aria-label="Site header"><CruxerLogo /><nav className="flex items-center gap-1.5" aria-label="Primary"><ThemeToggle /><Link href="/login" className="hidden min-h-11 items-center rounded-xl px-3.5 text-[13px] font-medium text-muted-ink hover:text-ink sm:inline-flex">Log in</Link><Link href="/register" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-medium text-canvas transition-colors hover:bg-ink/85">Build your kit <ArrowUpRight size={15} /></Link></nav></header>;
}
