import { LegalDocument, SupportContact } from "@/components/marketing-page";
import { PRICING } from "@/lib/plans";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" updated="October 2026">
    <p>These terms govern your use of Cruxer, an interview-preparation service that turns a job description and a company website into a preparation kit and, on the Pro plan, live voice mock interviews. By creating an account you agree to them.</p>
    <h2>Your account</h2>
    <ul><li>You must provide a valid email address and verify it before generating kits or subscribing.</li><li>One person per account. Creating multiple accounts to get around plan limits is not allowed and may lead to suspension.</li><li>You are responsible for activity under your account and for keeping your password secure.</li></ul>
    <h2>Plans and limits</h2>
    <ul><li><b>Free:</b> {PRICING.free.kits} kit generations per calendar month (UTC). Live mock interviews are not included.</li><li><b>Pro (${PRICING.pro.price}/month):</b> {PRICING.pro.kits} kit generations and {PRICING.pro.mockMinutes} minutes of live voice mock interviews per billing period, with sessions of up to {PRICING.pro.maxSessionMinutes} minutes.</li><li>Section regenerations are subject to a per-kit fair-use limit. Unused allowances do not roll over.</li><li>We may change plans or prices with at least 30 days&apos; notice; changes apply from your next billing period.</li></ul>
    <h2>Billing</h2>
    <p>Pro is a monthly subscription with no free trial, billed in advance through Dodo Payments, our merchant of record. Dodo Payments processes your payment and handles applicable taxes. Your subscription renews automatically until you cancel. You can cancel at any time from the billing page; you keep Pro until the end of the period you have paid for. See our <a href="/refunds" className="text-indigo-200 underline underline-offset-4">refund policy</a>.</p>
    <h2>Acceptable use</h2>
    <ul><li>Only submit job descriptions and company URLs you are entitled to use. Do not submit confidential material you are not authorised to share.</li><li>Do not attempt to probe, overload, scrape or circumvent the service, its limits, or its security.</li><li>Do not use the voice interviewer to record or impersonate other people.</li></ul>
    <h2>AI-generated content</h2>
    <p>Kits and scorecards are generated with AI models from public sources and the material you provide. They can be incomplete or wrong. Cruxer is a practice tool: it does not guarantee interview outcomes, and scorecards are coaching feedback, not a hiring assessment.</p>
    <h2>Your content</h2>
    <p>You keep ownership of what you submit and of your kits. You grant us the permissions needed to operate the service, including sending your material to the AI and voice providers described in our <a href="/privacy" className="text-indigo-200 underline underline-offset-4">privacy policy</a>.</p>
    <h2>Termination</h2>
    <p>You may stop using Cruxer at any time. We may suspend accounts that break these terms. Sections that by their nature should survive termination will survive.</p>
    <h2>Liability</h2>
    <p>The service is provided &ldquo;as is&rdquo;. To the extent permitted by law, our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.</p>
    <h2>Contact</h2>
    <p>Questions about these terms: <SupportContact />.</p>
  </LegalDocument>;
}
