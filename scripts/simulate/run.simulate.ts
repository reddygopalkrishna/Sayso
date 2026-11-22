// Try Sayso's real command pipeline without a Mac, a microphone or a key.
// Usage: SAY="open GitHub; new tab; new email" pnpm simulate
//        SAY="dictate: um tell priya to meet me at five" pnpm simulate
// Optional: APP=com.google.Chrome (the app "in front"; default Chrome). Nothing real is typed or
// clicked: a fake Mac records what Sayso WOULD do, and the lines are printed.
import { commands, endCommands } from '../../packages/command-grammar/src/index.ts';
import { it } from 'vitest';
import { UtterancePipeline } from '../../apps/desktop/src/main/core/UtterancePipeline.ts';
import { TextCleanup } from '../../apps/desktop/src/main/core/cleanup/TextCleanup.ts';
import { CommandEngine } from '../../apps/desktop/src/main/core/commands/CommandEngine.ts';
import {
  resolveOpen,
  resolveSwitch,
  type KnownApp,
} from '../../apps/desktop/src/main/core/resolver/AppResolver.ts';
import type { TranscriptSegment } from '../../apps/desktop/src/main/core/stt/types.ts';

const apps: KnownApp[] = [
  { name: 'Google Chrome', bundleId: 'com.google.Chrome', running: true },
  { name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', running: true },
  { name: 'WhatsApp', bundleId: 'net.whatsapp.WhatsApp', running: true },
  { name: 'Claude', bundleId: 'com.anthropic.claudefordesktop', running: true },
];

function segment(text: string): TranscriptSegment {
  const words = text
    .split(' ')
    .filter(Boolean)
    .map((w, i) => ({ text: w, startMs: i * 300, endMs: i * 300 + 250, p: 0.9 }));
  return { text, words, audioMs: 2000, sttMs: 200, model: 'simulated' };
}

it('simulate', async () => {
  const said = (process.env['SAY'] ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (said.length === 0) {
    console.log('Set SAY, e.g.  SAY="open GitHub; new tab; new email" pnpm simulate');
    return;
  }
  const bundleId = process.env['APP'] ?? 'com.google.Chrome';
  const log: string[] = [];
  const pipeline = new UtterancePipeline({
    readContext: async () => ({
      bundleId,
      appName: 'App',
      focusRole: 'AXTextArea',
      secureField: false,
    }),
    // No AI: text is only capitalised and ended with a full stop.
    cleanup: new TextCleanup({
      provider: {
        name: 'simulated',
        model: 'none',
        cleanup: async (r) => `${r.rawText[0]?.toUpperCase() ?? ''}${r.rawText.slice(1)}.`,
      },
      level: () => 'full',
    }),
    actions: {
      insertText: async (t) => void log.push(`types: ${t}`),
      pressKey: async (k, m) => void log.push(`presses: ${[...m, k].join('+')}`),
      scroll: async (d, a) => void log.push(`scrolls ${d} ${a}`),
      pressElement: async (l) => void log.push(`clicks: ${l}`),
      focusField: async (l) => void log.push(`focuses: ${l}`),
      pressPosition: async (k, i) => void log.push(`opens ${k} number ${i}`),
      listApps: async () => [],
      openApp: async (id) => void log.push(`opens app: ${id}`),
      activateApp: async (id) => void log.push(`switches to app: ${id}`),
      openUrl: async (u) => void log.push(`opens address: ${u}`),
    },
    chip: { confirm: async (label) => (log.push(`shows chip: ${label}`), 'proceed') },
    endCommands,
    engine: new CommandEngine(commands),
    settleMs: () => 0,
    pageWaitMs: () => 0,
    appReadyMs: () => 0,
    messageSpeed: () => 0,
    profileValue: () => null,
    style: () => 'default',
    snippets: { find: () => null },
    confirmMs: () => 8_000,
    onAwaitConfirm: () => undefined,
    onConfirmEnd: () => undefined,
    dictionary: () => [],
    resolver: {
      resolveOpen: async (t) => resolveOpen(t, apps),
      resolveSwitch: async (n) => resolveSwitch(n, apps),
    },
    pauseMs: () => 600,
    previewMs: () => 1000,
    onOutcome: () => undefined,
  });

  console.log(`\nApp in front: ${bundleId}\n`);
  for (const line of said) {
    const dictation = /^dictate:/i.test(line);
    const text = line.replace(/^dictate:\s*/i, '');
    log.length = 0;
    try {
      await pipeline.deliver(segment(text), dictation ? 'dictation' : 'command');
    } catch (error) {
      log.push(`cannot do it: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(`You say: "${text}"${dictation ? '  (dictation)' : ''}`);
    for (const l of log.length ? log : ['(nothing)']) console.log(`   Sayso ${l}`);
  }
  console.log('');
});
