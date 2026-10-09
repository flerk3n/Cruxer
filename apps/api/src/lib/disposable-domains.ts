/**
 * Common disposable/temporary inbox providers. Free kits cost real provider spend,
 * so throwaway inboxes are refused at registration. Extend as abuse is observed.
 */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonbox.net", "burnermail.io",
  "byom.de", "discard.email", "dispostable.com", "dropmail.me", "emailondeck.com", "fakeinbox.com",
  "fakemail.net", "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "harakirimail.com",
  "inboxbear.com", "inboxkitten.com", "incognitomail.org", "jetable.org", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailinator.net", "mailnesia.com", "mailpoof.com", "mailsac.com", "mintemail.com",
  "mohmal.com", "moakt.com", "mytemp.email", "nada.email", "sharklasers.com", "spam4.me", "spambox.us",
  "spamgourmet.com", "temp-mail.io", "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.dev",
  "tempmail.net", "tempmailo.com", "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de",
  "trashmail.net", "yopmail.com", "yopmail.fr", "yopmail.net", "emailfake.com", "tmail.ws", "tmpmail.org",
  "tmpmail.net", "grr.la", "pokemail.net", "mail.tm", "linshiyouxiang.net", "luxusmail.org", "fexpost.com"
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@").pop()?.toLowerCase().trim();
  if (!domain) return false;
  // Match subdomains of listed providers as well (e.g. x.mailinator.com).
  const parts = domain.split(".");
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(index).join("."))) return true;
  }
  return false;
}
