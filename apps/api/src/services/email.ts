import type { AppConfig } from "../config/env.js";

type EmailConfig = Pick<AppConfig, "RESEND_API_KEY" | "EMAIL_FROM" | "NODE_ENV">;

/** Sends transactional email through Resend. Without a key (local dev) the link is logged instead. */
export async function sendEmail(config: EmailConfig, message: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!config.RESEND_API_KEY) {
    if (config.NODE_ENV === "production") throw new Error("Email delivery is not configured.");
    console.info(JSON.stringify({ event: "email_not_sent_dev", to: message.to, subject: message.subject, text: message.text }));
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Resend responded with ${response.status}.`);
  } finally {
    clearTimeout(timeout);
  }
}

export function verificationEmail(name: string | undefined, link: string): { subject: string; html: string; text: string } {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return {
    subject: "Verify your Cruxer email",
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nConfirm your email to start building interview kits:\n${link}\n\nThis link expires in 24 hours. If you did not create a Cruxer account, ignore this email.`,
    html: `<p>${greeting}</p><p>Confirm your email to start building interview kits.</p><p><a href="${escapeHtml(link)}">Verify my email</a></p><p style="color:#666;font-size:13px">This link expires in 24 hours. If you did not create a Cruxer account, ignore this email.</p>`
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
