import Link from "next/link";
import { Sparkle } from "lucide-react";

export function CruxerLogo() {
  return <Link href="/" className="inline-flex items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight text-ink"><span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-canvas"><Sparkle size={15} aria-hidden="true" /></span>Cruxer</Link>;
}
