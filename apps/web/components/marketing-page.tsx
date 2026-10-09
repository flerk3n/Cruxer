import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import logoMark from "../../../logo.svg";

/** Shared chrome for public, static pages (pricing and policies). */
export function MarketingPage({ children }: { children: React.ReactNode }) {
  return <div className="landing-shell marketing-shell">
    <header className="marketing-frame flex items-center justify-between py-6 sm:py-8"><Link href="/" className="flex items-center gap-2 rounded-xl" aria-label="Cruxer home"><Image src={logoMark} alt="" className="h-12 w-12 brightness-0 invert" priority /><span className="marketing-wordmark text-3xl leading-none text-white">Cruxer</span></Link><Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-100/75 transition hover:text-white"><ArrowLeft size={14} />Back to home</Link></header>
    <main id="main" className="marketing-frame pb-20">{children}</main>
    <footer className="marketing-frame flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 py-8 text-xs text-indigo-100/55"><span>© {new Date().getFullYear()} Cruxer</span><Link href="/pricing" className="hover:text-white">Pricing</Link><Link href="/terms" className="hover:text-white">Terms</Link><Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/refunds" className="hover:text-white">Refunds</Link></footer>
  </div>;
}

export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export function SupportContact() {
  return supportEmail ? <a href={`mailto:${supportEmail}`} className="text-indigo-200 underline underline-offset-4 hover:text-white">{supportEmail}</a> : <span>the support address listed on our website</span>;
}

export function LegalDocument({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <MarketingPage><article className="mx-auto max-w-3xl pt-8"><p className="marketing-eyebrow">Last updated {updated}</p><h1 className="marketing-section-title mt-5 text-5xl leading-[.9] text-white sm:text-6xl">{title}</h1><div className="legal-copy mt-10 space-y-6 text-[15px] leading-7 text-slate-300 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">{children}</div></article></MarketingPage>;
}
