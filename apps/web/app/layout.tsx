import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument-serif", weight: "400", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = { title: { default: "Cruxer - Interview preparation", template: "%s · Cruxer" }, description: "Research-grounded interview preparation kits." };

const themeScript = `(() => { try { const saved = localStorage.getItem('cruxer-theme'); const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); } catch {} })()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${dmSans.variable}`}><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}<Analytics /></body></html>;
}
