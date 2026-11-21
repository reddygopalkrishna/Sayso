import type { CommandAction } from '@sayso/command-grammar';
import type { Key, Modifier } from '@sayso/helper-protocol';

export interface KeyStroke {
  key: Key;
  modifiers: Modifier[];
}

// How each app sends a message. Chat apps send on Enter (the default); mail apps use a shortcut,
// because Enter there starts a new line. Per-app overrides come from app_profile in step 7.
const SEND_SHORTCUTS: Record<string, KeyStroke> = {
  'com.apple.mail': { key: 'd', modifiers: ['cmd', 'shift'] },
  'com.microsoft.Outlook': { key: 'enter', modifiers: ['cmd'] },
  'com.readdle.smartemail-Mac': { key: 'enter', modifiers: ['cmd'] },
  'com.superhuman.electron': { key: 'enter', modifiers: ['cmd'] },
};

// A new chat: ⌘N in the desktop apps (checked in their File menus: "New Chat" in ChatGPT, "New
// Session" in Claude). In a browser the sites use ⇧⌘O (chatgpt.com and claude.ai), so that is the
// default; on other pages it only opens the browser's bookmark manager.
const NEW_CHAT_SHORTCUTS: Record<string, KeyStroke> = {
  'com.anthropic.claudefordesktop': { key: 'n', modifiers: ['cmd'] },
  'com.openai.chat': { key: 'n', modifiers: ['cmd'] },
  'com.openai.codex': { key: 'n', modifiers: ['cmd'] },
};
const NEW_CHAT_IN_BROWSER: KeyStroke = { key: 'o', modifiers: ['cmd', 'shift'] };

const ENTER: KeyStroke = { key: 'enter', modifiers: [] };

/** Turns a command action into the key stroke to press in the app that is in front. */
export function keyStrokeFor(
  action: Extract<CommandAction, { type: 'contextual_send' | 'contextual_new_chat' | 'keyPress' }>,
  bundleId: string | null,
): KeyStroke {
  switch (action.type) {
    case 'contextual_send':
      return (bundleId && SEND_SHORTCUTS[bundleId]) || ENTER;
    case 'contextual_new_chat':
      return (bundleId && NEW_CHAT_SHORTCUTS[bundleId]) || NEW_CHAT_IN_BROWSER;
    case 'keyPress':
      return { key: action.key, modifiers: [...(action.modifiers ?? [])] };
  }
}
