import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { MarketingPage } from "@/components/marketing-page";
import { PRICING } from "@/lib/plans";

export const metadata = { title: "Pricing", description: "Cruxer is free for up to 5 interview kits a month. Pro adds 25 kits and live voice mock interviews for $9/month." };

const rows: Array<{ label: string; free: string | boolean; pro: string | boolean }> = [
  { label: "Interview kit generations", free: `${PRICING.free.kits} / month`, pro: `${PRICING.pro.kits} / month` },
  { label: "Company research, question bank, flashcards and study plan", free: true, pro: true },
  { label: "Practice mode, confidence tracking and Readiness Runway", free: true, pro: true },
  { label: "Section regenerations per kit", free: String(PRICING.free.regenerationsPerKit), pro: String(PRICING.pro.regenerationsPerKit) },
  { label: "Live voice mock interviews", free: false, pro: `${PRICING.pro.mockMinutes} min / month` },
  { label: "AI scorecard after each mock", free: false, pro: true }
];

export default function PricingPage() {
  return <MarketingPage>
    <section className="mx-auto max-w-5xl pt-8 text-center"><p className="marketing-eyebrow justify-center">Pricing</p><h1 className="marketing-section-title mt-6 text-5xl leading-[.88] text-white sm:text-7xl">Prepare for free.<br /><i>Rehearse with Pro.</i></h1><p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-300">Start with five kits a month. Upgrade when you want more roles and a live interviewer to practise with.</p></section>
    <section className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-2">
      <PlanCard name="Free" price={0} blurb="For a focused search." cta="Start free" href="/register" features={[`${PRICING.free.kits} kits every month`, "Full kit: research, questions, flashcards, schedule", "Practice mode and progress tracking"]} />
      <PlanCard name="Pro" price={PRICING.pro.price} blurb="For an active search across several roles." cta="Get Pro" href="/dashboard/billing" highlight features={[`${PRICING.pro.kits} kits every month`, `${PRICING.pro.mockMinutes} minutes of live voice mock interviews (up to ${PRICING.pro.maxSessionMinutes} min per session)`, "AI scorecard after every mock", `${PRICING.pro.regenerationsPerKit} regenerations per kit`]} />
    </section>
    <section className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.03]"><table className="w-full text-left text-sm"><caption className="sr-only">Plan comparison</caption><thead><tr className="border-b border-white/10 text-xs uppercase tracking-[.14em] text-indigo-100/70"><th scope="col" className="px-5 py-4 font-semibold">Feature</th><th scope="col" className="px-5 py-4 font-semibold">Free</th><th scope="col" className="px-5 py-4 font-semibold">Pro</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-b border-white/5 last:border-0"><th scope="row" className="px-5 py-4 font-medium text-slate-200">{row.label}</th><td className="px-5 py-4 text-slate-300"><Cell value={row.free} /></td><td className="px-5 py-4 text-slate-100"><Cell value={row.pro} /></td></tr>)}</tbody></table></section>
    <section className="mx-auto mt-16 grid max-w-3xl gap-8 text-sm leading-7 text-slate-300">
      <Faq q="Is there a free trial of Pro?">No. The Free plan is the trial: every account gets {PRICING.free.kits} full kits a month with no card required. Pro is billed monthly and can be cancelled any time; you keep Pro until the end of the period you paid for.</Faq>
      <Faq q="When do my limits reset?">Free limits reset on the first day of each calendar month (UTC). Pro limits reset on your billing date each month. Unused kits and minutes do not roll over.</Faq>
      <Faq q="Does a failed generation use up a kit?">No. If a kit can&apos;t be generated, the attempt is returned to your allowance automatically.</Faq>
      <Faq q="How are mock interview minutes counted?">By the actual length of each voice session, rounded up to the second. A session ends automatically when your remaining minutes run out.</Faq>
      <Faq q="Who processes payments?">Payments are handled by Dodo Payments, our merchant of record, which also calculates and collects applicable sales tax or VAT. Prices are in USD.</Faq>
    </section>
  </MarketingPage>;
}

function PlanCard({ name, price, blurb, cta, href, features, highlight }: { name: string; price: number; blurb: string; cta: string; href: string; features: string[]; highlight?: boolean }) {
  return <div className={`relative rounded-[1.75rem] border p-7 text-left sm:p-9 ${highlight ? "border-indigo-300/50 bg-indigo-300/[.07] shadow-[0_24px_70px_rgba(99,102,241,.18)]" : "border-white/10 bg-white/[.03]"}`}>{highlight && <span className="absolute right-6 top-6 rounded-full bg-indigo-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-slate-950">Most useful</span>}<p className="text-sm font-semibold text-indigo-100">{name}</p><p className="mt-4 text-5xl font-semibold tracking-tight text-white">${price}<span className="text-base font-medium text-slate-400">/month</span></p><p className="mt-3 text-sm text-slate-400">{blurb}</p><ul className="mt-7 space-y-3 text-sm text-slate-200">{features.map((feature) => <li key={feature} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />{feature}</li>)}</ul><Link href={href} className={`mt-9 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold transition hover:-translate-y-0.5 ${highlight ? "bg-indigo-100 text-[#101631] hover:bg-white" : "border border-white/20 text-white hover:bg-white/10"}`}>{cta}</Link></div>;
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check size={16} className="text-emerald-300" aria-label="Included" />;
  if (value === false) return <Minus size={16} className="text-slate-500" aria-label="Not included" />;
  return <>{value}</>;
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return <div><h2 className="text-base font-semibold text-white">{q}</h2><p className="mt-2">{children}</p></div>;
}
