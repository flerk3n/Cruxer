import Link from "next/link";
import Image from "next/image";
import logoMark from "../../../logo.svg";

export function CruxerLogo({ tone = "default" }: { tone?: "default" | "light" }) {
  return <Link href="/" className={tone === "light" ? "inline-flex items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight text-white" : "inline-flex items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight text-ink"}><span className={tone === "light" ? "grid h-7 w-7 place-items-center rounded-lg bg-white p-1.5" : "grid h-7 w-7 place-items-center rounded-lg bg-ink p-1.5 text-canvas"}><Image src={logoMark} alt="" className="h-full w-full" priority /></span>Cruxer</Link>;
}
