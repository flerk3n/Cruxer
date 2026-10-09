import { LegalDocument, SupportContact } from "@/components/marketing-page";

export const metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return <LegalDocument title="Refund & Cancellation Policy" updated="October 2026">
    <h2>Cancelling</h2>
    <p>You can cancel Pro at any time from <b>Plan &amp; billing → Manage billing</b>. Cancellation stops future renewals; you keep Pro access until the end of the billing period you have already paid for, after which your account returns to the Free plan. Your kits are never deleted when you downgrade.</p>
    <h2>Refunds</h2>
    <ul><li>If you were charged for a renewal you did not intend and have not used any Pro allowance since that charge, contact us within 7 days for a full refund of that renewal.</li><li>If a technical problem on our side prevented you from using Pro, contact us and we will refund or credit the affected period.</li><li>Otherwise, payments for a billing period that has started are non-refundable, because AI generation and voice minutes incur costs as soon as they are used.</li><li>Failed kit generations are automatically returned to your allowance and are never charged against it.</li></ul>
    <p>Refunds are issued by Dodo Payments, our merchant of record, to the original payment method. Where local consumer law gives you additional rights, those rights apply.</p>
    <h2>How to request</h2>
    <p>Email <SupportContact /> from your account email address with the date of the charge.</p>
  </LegalDocument>;
}
