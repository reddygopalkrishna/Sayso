import type { Tone } from './types.ts';

// Built-in defaults; per-app overrides come from app_profile (local DB) in step 7.
const LITERAL_PREFIXES = ['com.jetbrains.'];
const DEFAULT_TONES: Record<string, Tone> = {
  // Terminals and code editors: never rewrite.
  'com.apple.Terminal': 'literal',
  'com.googlecode.iterm2': 'literal',
  'dev.warp.Warp-Stable': 'literal',
  'com.mitchellh.ghostty': 'literal',
  'net.kovidgoyal.kitty': 'literal',
  'io.alacritty': 'literal',
  'com.microsoft.VSCode': 'literal',
  'com.microsoft.VSCodeInsiders': 'literal',
  'com.todesktop.230313mzl4w4u92': 'literal', // Cursor
  'com.exafunction.windsurf': 'literal',
  'dev.zed.Zed': 'literal',
  'com.sublimetext.4': 'literal',
  'com.apple.dt.Xcode': 'literal',
  // Mail and documents.
  'com.apple.mail': 'professional',
  'com.microsoft.Outlook': 'professional',
  'com.readdle.smartemail-Mac': 'professional',
  'com.superhuman.electron': 'professional',
  'com.microsoft.Word': 'professional',
  'com.apple.iWork.Pages': 'professional',
  'notion.id': 'professional',
  'com.apple.Notes': 'professional',
  'com.microsoft.teams2': 'casual',
  // Chat.
  'com.tinyspeck.slackmacgap': 'casual',
  'net.whatsapp.WhatsApp': 'casual',
  'com.apple.MobileSMS': 'casual',
  'com.hnc.Discord': 'casual',
  'ru.keepcoder.Telegram': 'casual',
  'org.telegram.desktop': 'casual',
  'com.anthropic.claudefordesktop': 'casual',
  'com.openai.chat': 'casual',
};

export function toneForApp(
  bundleId: string | null,
  overrides: Readonly<Record<string, Tone>> = {},
): Tone {
  if (!bundleId) return 'casual';
  const override = overrides[bundleId];
  if (override) return override;
  const known = DEFAULT_TONES[bundleId];
  if (known) return known;
  if (LITERAL_PREFIXES.some((prefix) => bundleId.startsWith(prefix))) return 'literal';
  return 'casual';
}
