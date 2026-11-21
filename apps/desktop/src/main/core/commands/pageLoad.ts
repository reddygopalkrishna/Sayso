/** Browsers, by bundle id: where Enter or a click usually loads a new page. */
const BROWSERS: ReadonlySet<string> = new Set([
  'com.google.Chrome',
  'com.google.Chrome.canary',
  'com.apple.Safari',
  'org.mozilla.firefox',
  'company.thebrowser.Browser', // Arc
  'com.microsoft.edgemac',
  'com.brave.Browser',
  'com.operasoftware.Opera',
  'com.vivaldi.Vivaldi',
  'com.kagi.kagimacOS', // Orion
  'app.zen-browser.zen',
]);

export const isBrowser = (bundleId: string | null): boolean =>
  bundleId !== null && BROWSERS.has(bundleId);

/** Default wait, in ms, after a step that loads a page (the next step needs the new page). */
export const DEFAULT_PAGE_WAIT_MS = 1_800;

/** What a step did, as far as "does the screen now show a different page" goes. */
export type StepEffect =
  | { type: 'keyPress'; key: string; modifiers?: readonly string[] }
  | { type: 'contextual_send' }
  | { type: 'pressElement' }
  | { type: 'pressPosition' }
  | { type: 'openTarget'; resolved: 'app' | 'url' }
  | { type: 'other' };

/**
 * True when the step probably loads a page, so the next step must wait for it:
 * Enter or "send" in a browser (an address or search box), a click or "open the Nth" in a browser,
 * and opening a website. New tab, scrolling, going back and opening an app are quick: they use the
 * short settle only.
 */
export function loadsPage(effect: StepEffect, bundleId: string | null): boolean {
  switch (effect.type) {
    case 'openTarget':
      return effect.resolved === 'url';
    case 'contextual_send':
      return isBrowser(bundleId);
    case 'keyPress':
      return isBrowser(bundleId) && effect.key === 'enter' && (effect.modifiers ?? []).length === 0;
    case 'pressElement':
    case 'pressPosition':
      return isBrowser(bundleId);
    case 'other':
      return false;
  }
}
