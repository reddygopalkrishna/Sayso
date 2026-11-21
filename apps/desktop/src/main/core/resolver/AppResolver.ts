export interface KnownApp {
  name: string;
  bundleId: string;
  running: boolean;
}

export type OpenResolution =
  | { type: 'app'; bundleId: string; name: string }
  | { type: 'url'; url: string; kind: 'domain' | 'site' | 'search' };

/** Sites people say by name ("open GitHub"). Matched after installed apps, before a web search. */
export const KNOWN_SITES: Readonly<Record<string, string>> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
  'google drive': 'https://drive.google.com',
  'google docs': 'https://docs.google.com',
  'google calendar': 'https://calendar.google.com',
  'google maps': 'https://maps.google.com',
  youtube: 'https://www.youtube.com',
  linkedin: 'https://www.linkedin.com',
  twitter: 'https://x.com',
  x: 'https://x.com',
  reddit: 'https://www.reddit.com',
  'hacker news': 'https://news.ycombinator.com',
  stackoverflow: 'https://stackoverflow.com',
  'stack overflow': 'https://stackoverflow.com',
  wikipedia: 'https://www.wikipedia.org',
  amazon: 'https://www.amazon.com',
  netflix: 'https://www.netflix.com',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  notion: 'https://www.notion.so',
  linear: 'https://linear.app',
  figma: 'https://www.figma.com',
  vercel: 'https://vercel.com',
  cloudflare: 'https://dash.cloudflare.com',
  stripe: 'https://dashboard.stripe.com',
  'product hunt': 'https://www.producthunt.com',
};

const FUZZY_MIN_LENGTH = 5;
const FUZZY_MIN_SIMILARITY = 0.85;

/** Lowercase words only; "GitHub dot com" → "github.com" is handled by `asDomain`. */
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "github dot com", "github.com", "docs.rs" → "github.com"; null when it is not a domain. */
export function asDomain(target: string): string | null {
  const joined = target
    .toLowerCase()
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/.test(joined) ? joined : null;
}

function similarity(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] ?? 0;
      prev[j] = Math.min(
        above + 1,
        (prev[j - 1] ?? 0) + 1,
        diagonal + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
      diagonal = above;
    }
  }
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - (prev[b.length] ?? 0) / longest;
}

/** Exact name; name starts with the words; name contains them as a word (chrome, Google Chrome); mis-hearing. */
type Tier = 'exact' | 'prefix' | 'word' | 'fuzzy';

/** Best app for a spoken name at the given tier; running apps and shorter names win ties. */
function findApp(name: string, apps: readonly KnownApp[], tier: Tier): KnownApp | null {
  const candidates = apps.filter((app) => {
    const n = words(app.name);
    if (tier === 'exact') return n === name;
    if (tier === 'prefix') return n.startsWith(`${name} `);
    if (tier === 'word') return ` ${n} `.includes(` ${name} `);
    return name.length >= FUZZY_MIN_LENGTH && similarity(n, name) >= FUZZY_MIN_SIMILARITY;
  });
  candidates.sort((a, b) => Number(b.running) - Number(a.running) || a.name.length - b.name.length);
  return candidates[0] ?? null;
}

function findSite(name: string, tier: 'exact' | 'fuzzy'): string | null {
  const exact = KNOWN_SITES[name];
  if (exact) return exact;
  if (tier === 'exact' || name.length < FUZZY_MIN_LENGTH) return null;
  let best: { url: string; score: number } | null = null;
  for (const [site, url] of Object.entries(KNOWN_SITES)) {
    const score = similarity(site, name);
    if (score >= FUZZY_MIN_SIMILARITY && (!best || score > best.score)) best = { url, score };
  }
  return best?.url ?? null;
}

/**
 * "open X" (PRD §7.5). Order: a domain you spelled out → an installed app with exactly that name →
 * a known website → an app whose name starts with it, or contains it as a word (chrome, Google
 * Chrome) → a close mis-hearing of an app or site → a
 * web search. (When an app and a site both match, the PRD asks once and remembers; that needs the
 * local database, step 7, so the exact app wins for now.)
 */
export function resolveOpen(target: string, apps: readonly KnownApp[]): OpenResolution {
  const domain = asDomain(target);
  if (domain) return { type: 'url', url: `https://${domain}`, kind: 'domain' };
  const name = words(target);
  const app = (tier: Tier): OpenResolution | null => {
    const found = findApp(name, apps, tier);
    return found ? { type: 'app', bundleId: found.bundleId, name: found.name } : null;
  };
  const site = (tier: 'exact' | 'fuzzy'): OpenResolution | null => {
    const url = findSite(name, tier);
    return url ? { type: 'url', url, kind: 'site' } : null;
  };
  return (
    app('exact') ??
    site('exact') ??
    app('prefix') ??
    app('word') ??
    app('fuzzy') ??
    site('fuzzy') ?? {
      type: 'url',
      url: `https://www.google.com/search?q=${encodeURIComponent(target.trim())}`,
      kind: 'search',
    }
  );
}

/** "switch to X": only running apps count. */
export function resolveSwitch(name: string, apps: readonly KnownApp[]): KnownApp | null {
  const running = apps.filter((app) => app.running);
  const n = words(name);
  return (
    findApp(n, running, 'exact') ??
    findApp(n, running, 'prefix') ??
    findApp(n, running, 'word') ??
    findApp(n, running, 'fuzzy')
  );
}

export class AppResolver {
  constructor(private readonly listApps: () => Promise<readonly KnownApp[]>) {}

  async resolveOpen(target: string): Promise<OpenResolution> {
    return resolveOpen(target, await this.listApps());
  }

  async resolveSwitch(name: string): Promise<KnownApp | null> {
    return resolveSwitch(name, await this.listApps());
  }
}
