import { LegalDocument, SupportContact } from "@/components/marketing-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" updated="October 2026">
    <p>This policy explains what Cruxer collects, why, and who processes it on our behalf.</p>
    <h2>What we collect</h2>
    <ul><li><b>Account data:</b> your name, email address, a salted password hash, and whether your email is verified.</li><li><b>Preparation content:</b> job descriptions and company URLs you submit, the kits generated from them, your edits, and practice confidence ratings.</li><li><b>Mock interviews (Pro):</b> the text transcript of each voice session, its duration, and the resulting scorecard. Cruxer does not store raw audio.</li><li><b>Billing:</b> your subscription status and billing dates. Card details are handled by Dodo Payments and never reach our servers.</li><li><b>Usage analytics:</b> privacy-friendly page views and product events through Vercel Web Analytics, without cookies. URLs are reported without query strings.</li></ul>
    <h2>Service providers</h2>
    <ul><li><b>Google Gemini</b>: generates kit content and mock interview scorecards from the material you submit.</li><li><b>Tavily</b>: searches public interview-process discussions for the role.</li><li><b>ElevenLabs</b>: runs the live voice interviewer and produces the transcript (Pro).</li><li><b>Dodo Payments</b>: merchant of record for subscriptions, payments and tax.</li><li><b>MongoDB Atlas, Render and Vercel</b>: database and hosting.</li><li><b>Resend</b>: sends verification and account emails.</li><li><b>Cloudflare Turnstile</b>: protects sign-up and sign-in from automated abuse.</li></ul>
    <h2>How we use data</h2>
    <p>To provide and secure the service, enforce plan limits, process subscriptions, and understand aggregate product usage. We do not sell personal data and do not use your content to train our own models.</p>
    <h2>Retention and deletion</h2>
    <p>We keep your data while your account is active. You can ask us to delete your account and its data at any time by contacting <SupportContact />; billing records are retained as required by law by Dodo Payments.</p>
    <h2>Security</h2>
    <p>Sessions use signed, HTTP-only cookies; provider keys are kept server-side; company research only fetches public pages and respects robots.txt.</p>
    <h2>Contact</h2>
    <p>Privacy questions or requests: <SupportContact />.</p>
  </LegalDocument>;
}
