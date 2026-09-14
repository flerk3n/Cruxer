import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Practice" };
export default function PracticePage() {
  return <section className="mx-auto max-w-xl py-12 text-center"><p className="eyebrow">Practice session</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose a preparation kit to practise.</h1><p className="mt-3 text-sm leading-6 text-muted-ink">Flashcards are specific to a role, so this workspace never substitutes sample material for your own prompts.</p><Link href="/dashboard"><Button className="mt-6">Open your kits <ArrowRight size={16} /></Button></Link></section>;
}
