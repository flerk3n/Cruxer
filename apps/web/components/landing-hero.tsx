"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDownRight, ArrowRight, FileText, Layers3, MessageSquare, Search } from "lucide-react";
import Cubes from "@/components/Cubes";
import Folder from "@/components/Folder";
import PillNav from "@/components/PillNav";
import logoMark from "../../../logo.svg";
import { Safari } from "@/components/ui/safari";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { api } from "@/lib/api";

gsap.registerPlugin(ScrollTrigger);

const navItems = [
  { label: "Home", href: "/" },
  { label: "Method", href: "#method" },
  { label: "Toolkit", href: "#toolkit" },
  { label: "Start", href: "/login" }
];

const headline = ["Know", "the", "company.", "Own the room."];

export function LandingHero() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function handleStart(item: { href: string }, event: React.MouseEvent<HTMLAnchorElement>) {
    if (item.href !== "/login") return;
    event.preventDefault();
    try {
      await api.session();
      router.push("/dashboard");
    } catch {
      router.push("/login");
    }
  }

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const intro = gsap.utils.toArray<HTMLElement>("[data-intro]");
      const headlineWords = gsap.utils.toArray<HTMLElement>("[data-headline-word]");
      gsap.set([...intro, ...headlineWords], { autoAlpha: 0, y: 28 });
      gsap.timeline({ defaults: { ease: "power4.out" } })
        .to(intro, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 })
        .to(headlineWords, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.075 }, "-=0.2");

      gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]").forEach((section) => {
        const pieces = section.querySelectorAll("[data-reveal-piece]");
        gsap.fromTo(pieces, { autoAlpha: 0, y: 34 }, {
          autoAlpha: 1, y: 0, stagger: 0.11, duration: 0.8, ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 80%", once: true }
        });
      });

      gsap.to("[data-hero-cubes]", {
        yPercent: 3, rotate: -2, ease: "none",
        scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: 1.1 }
      });
      gsap.fromTo("[data-safari]", { autoAlpha: 0, y: 64, rotateX: 8 }, {
        autoAlpha: 1, y: 0, rotateX: 0, duration: 1.1, ease: "power3.out",
        scrollTrigger: { trigger: "[data-safari]", start: "top 88%", once: true }
      });
    });
    return () => media.revert();
  }, { scope: root });

  return <div ref={root} className="marketing-shell overflow-hidden">
    <header className="marketing-frame relative z-30 flex items-start justify-between pt-6 sm:pt-8">
      <Link href="/" className="group flex items-center gap-[0.525rem] rounded-xl" aria-label="Cruxer home">
        <Image src={logoMark} alt="" className="h-[3.85rem] w-[3.85rem] brightness-0 invert" priority />
        <span className="marketing-wordmark text-[clamp(1.61rem,3.5vw,3.01rem)] leading-none text-white">Cruxer</span>
      </Link>
      <div className="marketing-nav origin-top-right scale-[0.7]"><PillNav logo={logoMark.src} logoAlt="Cruxer" items={navItems} activeHref="/" baseColor="#11172f" pillColor="#eef2ff" pillTextColor="#11172f" hoveredPillTextColor="#eef2ff" onMobileMenuClick={() => undefined} onItemClick={handleStart} showLogo={false} /></div>
    </header>

    <main>
      <div className="marketing-stage relative">
        <div data-hero-cubes className="marketing-cubes pointer-events-auto absolute inset-y-0 left-1/2 z-0 w-[calc(100%-2.5rem)] max-w-[1600px] -translate-x-1/2 opacity-90 sm:w-[calc(100%-4.5rem)] lg:w-[calc(100%-6rem)] [mask-image:linear-gradient(to_bottom,black_0%,black_91%,transparent_100%)]">
          <Cubes gridSize={14} cubeSize={undefined} cellGap={1} maxAngle={68} radius={4.5} duration={{ enter: 0.16, leave: 0.34 }} autoAnimate={false} rippleOnClick={true} rippleColor="#c7d2fe" rippleSpeed={1.8} borderStyle="2px dashed #818cf8" faceColor="#1a1a2e" />
        </div>
      <section data-hero className="marketing-hero marketing-frame pointer-events-none relative z-10 flex min-h-[45rem] flex-col justify-start pt-20 sm:min-h-[51rem] sm:pt-24">
        <div className="pointer-events-none relative z-10 max-w-5xl">
          <h1 className="marketing-hero-title marketing-hero-title-bold max-w-5xl text-[clamp(3.9rem,10vw,9.8rem)] leading-[.8] text-white">
            {headline.map((word, index) => <span data-headline-word key={word + "-" + index} className={`${word === "company." ? "marketing-italic" : ""} ${word === "Own the room." ? "whitespace-nowrap" : ""}`}>{word} </span>)}
          </h1>
          <div data-intro className="mt-10 flex max-w-4xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-left text-lg font-medium leading-8 text-slate-100 sm:text-[1.3rem] sm:leading-9"><span className="block sm:whitespace-nowrap">Cruxer turns a role and a company into the exact evidence,</span><span className="block sm:whitespace-nowrap">questions, and practice that will make your next conversation count.</span></p>
            <ShimmerButton type="button" onClick={() => router.push("/register")} shimmerColor="#6366f1" shimmerSize="0.1em" shimmerDuration="2.6s" background="#eef2ff" className="pointer-events-auto min-h-14 px-7 text-[15px] font-bold text-slate-950 shadow-[0_16px_34px_rgba(165,180,252,.25)] hover:scale-[1.02]">Build a kit <ArrowDownRight size={18} /></ShimmerButton>
          </div>
        </div>
      </section>

      <section className="marketing-frame relative z-10 pb-28 sm:pb-36">
        <div data-safari className="marketing-safari mx-auto max-w-6xl rounded-[1.55rem] border border-white/20 bg-[#d8dbe2] p-1.5 shadow-[0_35px_90px_rgba(0,0,0,.42)] sm:p-2">
          <Safari url="cruxer.app" className="block w-full" />
        </div>
      </section>
      </div>

      <section id="method" data-scroll-reveal className="marketing-frame grid gap-12 border-t border-white/10 py-24 sm:py-32 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
        <div data-reveal-piece><p className="marketing-eyebrow">01 — The read</p><h2 className="marketing-section-title marketing-section-title-sans mt-6 text-5xl leading-[.87] text-white sm:text-6xl">The role says one thing.<br /><i>The signals say more.</i></h2></div>
        <div data-reveal-piece className="self-end"><p className="max-w-xl text-xl leading-9 text-slate-300">A job description is only the starting point. Cruxer traces the product, the moment, and the team around it then turns that research into a sharp plan you can actually use.</p><div className="mt-10 grid gap-3 sm:grid-cols-3"><Stat value="01" label="Company context" /><Stat value="02" label="Role signals" /><Stat value="03" label="Your proof" /></div></div>
      </section>

      <section id="toolkit" data-scroll-reveal className="marketing-frame pb-28 sm:pb-40">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <article data-reveal-piece className="marketing-feature-card min-h-[31rem] overflow-hidden p-7 sm:p-10"><div className="relative z-10 max-w-sm"><p className="marketing-eyebrow">The research desk</p><h2 className="marketing-card-title mt-5 text-4xl leading-[.9] text-white">Everything you need to understand the room.</h2><p className="mt-5 text-sm leading-7 text-slate-300">Public company signals, the role’s real requirements, and the language worth carrying into the call.</p></div><div className="absolute bottom-9 right-4 sm:bottom-16 sm:right-16"><Folder color="#a5b4fc" size={1.7} items={[<FolderPaper key="brief" icon={<Search size={15} />} title="Company brief" />, <FolderPaper key="role" icon={<Layers3 size={15} />} title="Role map" />, <FolderPaper key="proof" icon={<FileText size={15} />} title="Proof bank" />]} /></div><span className="absolute bottom-8 left-7 font-mono text-xs text-indigo-200/65 sm:left-10">RESEARCH / 03</span></article>
          <div className="grid gap-5"><article data-reveal-piece className="marketing-feature-card marketing-feature-card-muted min-h-[15rem] p-7 sm:p-9"><p className="marketing-eyebrow">Coverage, visible</p><div className="mt-8 flex items-end justify-between gap-5"><h2 className="marketing-card-title max-w-sm text-3xl leading-[.93] text-white">Every signal gets a practice path.</h2><div className="rounded-2xl border border-emerald-200/20 bg-emerald-300/10 px-4 py-3 text-right"><p className="text-3xl font-semibold tracking-[-.08em] text-emerald-200">7/7</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100/70">covered</p></div></div></article>
            <article data-reveal-piece className="marketing-feature-card min-h-[15rem] p-7 sm:p-9"><p className="marketing-eyebrow">Rehearse deliberately</p><h2 className="marketing-card-title mt-7 max-w-sm text-3xl leading-[.93] text-white">Practice answers that connect the dots.</h2><div className="mt-7 flex items-center gap-2 text-xs text-indigo-100"><span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-300 text-slate-950"><MessageSquare size={14} /></span><span>Prompt → evidence → conviction</span></div></article></div>
        </div>
      </section>

      <section data-scroll-reveal className="marketing-frame pb-20 sm:pb-28"><div className="marketing-closing relative overflow-hidden rounded-[2rem] border border-white/15 px-6 py-16 sm:px-14 sm:py-24"><div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(199,210,254,.4)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" /><div data-reveal-piece className="relative mx-auto max-w-4xl text-center"><p className="marketing-eyebrow justify-center">Know what’s worth saying</p><h2 className="marketing-section-title mt-7 text-5xl leading-[.86] text-white sm:text-7xl">The interview starts before you walk in.</h2><p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-slate-300">Bring the role. Bring the company. Cruxer helps you find the crux.</p><Link href="/register" className="marketing-cta mt-10">Start preparing <ArrowRight size={18} /></Link></div></div></section>
    </main>
    <footer className="marketing-frame flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-8 text-xs text-indigo-100/55"><span>© {new Date().getFullYear()} Cruxer</span><span>Interview intelligence, made personal.</span></footer>
  </div>;
}

function Stat({ value, label }: { value: string; label: string }) { return <div className="border-l border-indigo-200/25 pl-3"><p className="font-mono text-xs text-indigo-200">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }

function FolderPaper({ icon, title }: { icon: React.ReactNode; title: string }) { return <div className="flex h-full flex-col p-3 text-slate-700"><span className="text-indigo-500">{icon}</span><span className="mt-auto text-[8px] font-bold leading-tight">{title}</span></div>; }
