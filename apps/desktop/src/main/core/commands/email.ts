/**
 * Gmail drafts by voice. The compose page opens in the browser and Gmail saves what is typed as a
 * draft by itself; Sayso never sends an email.
 */
const COMPOSE = 'https://mail.google.com/mail/?view=cm&fs=1';

/** "Priya at gmail dot com" → "priya@gmail.com"; null when it is not an address. */
export function spokenEmailAddress(spoken: string): string | null {
  const text = spoken
    .toLowerCase()
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+at(?: the rate(?: of)?)?\s+/g, '@')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s+/g, '');
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(text) ? text : null;
}

/** The Gmail compose address, addressed to `to` when it sounds like an email address. */
export function gmailComposeUrl(to?: string): string {
  const address = to ? spokenEmailAddress(to) : null;
  return address ? `${COMPOSE}&to=${encodeURIComponent(address)}` : COMPOSE;
}
