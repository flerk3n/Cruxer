import { Suspense } from "react";
import { BillingPanel } from "@/components/billing-panel";

export const metadata = { title: "Plan & billing" };
export default function BillingPage() { return <Suspense><BillingPanel /></Suspense>; }
