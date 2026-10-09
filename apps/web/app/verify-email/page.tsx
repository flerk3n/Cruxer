import { Suspense } from "react";
import { VerifyEmailPanel } from "@/components/verify-email-panel";

export const metadata = { title: "Verify email", robots: { index: false } };
export default function VerifyEmailPage() { return <Suspense><VerifyEmailPanel /></Suspense>; }
