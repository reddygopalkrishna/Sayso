import type { Key, MessageApp, Modifier } from '@sayso/command-grammar';

/** A key to press: "cmd+k" is { key: 'k', modifiers: ['cmd'] }. */
export interface KeyStroke {
  key: Key;
  modifiers: readonly Modifier[];
}

/**
 * The fixed steps for messaging someone in one app. Nothing here is guessed at run time:
 * open the app, wait, open its search, type the name, take the first match, type the text, send.
 * The delays are in milliseconds and are scaled by one setting (0 in tests).
 */
export interface MessageRecipe {
  app: MessageApp;
  /** The name the app resolver knows it by. */
  appName: string;
  /** Opens the app's search or quick switcher. */
  openSearch: KeyStroke;
  /** Pressed in order to take the first match once the name is typed. */
  pickFirst: readonly KeyStroke[];
  /** After the app is in front, before its search is used (only when Sayso just opened it). */
  appReadyMs: number;
  /** After the search is opened, before typing the name. */
  afterOpenSearchMs: number;
  /** After the name is typed, for the results to appear. */
  afterNameMs: number;
  /** After the first match is chosen, for the conversation to load and take focus. */
  afterPickMs: number;
}

const enter: KeyStroke = { key: 'enter', modifiers: [] };

export const RECIPES: Readonly<Record<MessageApp, MessageRecipe>> = {
  // Slack: ⌘K is the quick switcher; its first result is already selected, so Enter opens it and
  // leaves the cursor in the message box.
  slack: {
    app: 'slack',
    appName: 'Slack',
    openSearch: { key: 'k', modifiers: ['cmd'] },
    pickFirst: [enter],
    appReadyMs: 1_800,
    afterOpenSearchMs: 400,
    afterNameMs: 900,
    afterPickMs: 900,
  },
  // WhatsApp for Mac: ⌘F focuses the search box; Down then Enter takes the first chat.
  whatsapp: {
    app: 'whatsapp',
    appName: 'WhatsApp',
    openSearch: { key: 'f', modifiers: ['cmd'] },
    pickFirst: [{ key: 'down', modifiers: [] }, enter],
    appReadyMs: 1_800,
    afterOpenSearchMs: 400,
    afterNameMs: 900,
    afterPickMs: 900,
  },
};

/** The app in front, if it is one of the messaging apps. */
export function messageAppForBundle(bundleId: string | null): MessageApp | null {
  if (bundleId === 'com.tinyspeck.slackmacgap') return 'slack';
  if (bundleId === 'net.whatsapp.WhatsApp' || bundleId === 'desktop.WhatsApp') return 'whatsapp';
  return null;
}

/** "priya sharma" → "Priya Sharma", for the chip and the search box. */
export function titleCase(name: string): string {
  return name.replace(
    /(^|\s)(\p{L})/gu,
    (_m, space: string, letter: string) => space + letter.toUpperCase(),
  );
}
