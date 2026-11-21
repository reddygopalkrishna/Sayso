import { endCommands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { UtterancePipeline, type UtteranceOutcome } from './UtterancePipeline.ts';
import { TextCleanup } from './cleanup/TextCleanup.ts';
import type { LLMProvider } from './cleanup/types.ts';
import type { AppContext } from './context/HelperContext.ts';
import type { ChipResult } from './safety/PreviewChip.ts';
import { SafetyRefusal } from './safety/SafetyGate.ts';
import type { TranscriptSegment, TranscriptWord } from './stt/types.ts';

/** "hello there" then, if given, a trailing word after `gapMs`. */
function segment(text: string, trailing?: { word: string; gapMs: number }): TranscriptSegment {
  const words: TranscriptWord[] = text
    .split(' ')
    .filter(Boolean)
    .map((w, i) => ({ text: w, startMs: i * 300, endMs: i * 300 + 250, p: 0.9 }));
  let full = text;
  if (trailing) {
    const end = words.at(-1)?.endMs ?? 0;
    words.push({
      text: trailing.word,
      startMs: end + trailing.gapMs,
      endMs: end + trailing.gapMs + 250,
      p: 0.9,
    });
    full = `${text} ${trailing.word}`.trim();
  }
  return { text: full, words, audioMs: 2000, sttMs: 200, model: 'm' };
}

const context = (bundleId: string | null, over: Partial<AppContext> = {}): AppContext => ({
  bundleId,
  appName: 'App',
  focusRole: 'AXTextArea',
  secureField: false,
  ...over,
});

interface Setup {
  /** Contexts returned by successive reads; the last one repeats. */
  contexts: AppContext[];
  chip?: ChipResult;
  llm?: (raw: string) => string;
}

function setup({ contexts, chip = 'proceed', llm }: Setup) {
  const log: string[] = [];
  const outcomes: UtteranceOutcome[] = [];
  let reads = 0;
  const provider: LLMProvider = {
    name: 'fake',
    model: 'f',
    cleanup: async (r) => {
      log.push(`llm ${r.rawText}`);
      return llm ? llm(r.rawText) : `${r.rawText[0]?.toUpperCase() ?? ''}${r.rawText.slice(1)}.`;
    },
  };
  const pipeline = new UtterancePipeline({
    readContext: async () => contexts[Math.min(reads++, contexts.length - 1)] ?? context(null),
    cleanup: new TextCleanup({ provider, level: () => 'full' }),
    actions: {
      insertText: async (t) => void log.push(`insert ${t}`),
      pressKey: async (k, m) => void log.push(`key ${[...m, k].join('+')}`),
    },
    chip: {
      confirm: async (label, ms) => {
        log.push(`chip ${label} ${ms}`);
        return chip;
      },
    },
    endCommands,
    pauseMs: () => 600,
    previewMs: () => 1000,
    onOutcome: (o) => outcomes.push(o),
  });
  return { pipeline, log, outcomes };
}

const slack = context('com.tinyspeck.slackmacgap');
const send = { word: 'send', gapMs: 800 };

describe('UtterancePipeline', () => {
  it('cleans and inserts plain dictation', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('hello there'));
    expect(log).toEqual(['llm hello there', 'insert Hello there.']);
  });

  it('inserts, shows the preview chip, then sends', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('see you soon', send));
    expect(log).toEqual([
      'llm see you soon',
      'insert See you soon.',
      'chip Send 1000',
      'key enter',
    ]);
    expect(outcomes[0]?.command).toEqual({ id: 'send', result: 'ran' });
  });

  it('Esc on the chip types the spoken word instead and does not send', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [slack], chip: 'cancelled' });
    await pipeline.deliver(segment('see you soon', send));
    expect(log).toEqual([
      'llm see you soon',
      'insert See you soon.',
      'chip Send 1000',
      'insert  send',
    ]);
    expect(outcomes[0]?.command).toEqual({ id: 'send', result: 'cancelled' });
  });

  it('Esc on a command said alone types the word without a leading space', async () => {
    const { pipeline, log } = setup({ contexts: [slack], chip: 'cancelled' });
    await pipeline.deliver(segment('', { word: 'Send.', gapMs: 0 }));
    expect(log).toEqual(['chip Send 1000', 'insert Send.']);
  });

  it('cleans only the text part: the command never reaches the LLM', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('see you soon', send));
    expect(log.filter((l) => l.startsWith('llm'))).toEqual(['llm see you soon']);
  });

  it('sends with the mail app shortcut in Mail', async () => {
    const { pipeline, log } = setup({ contexts: [context('com.apple.mail')] });
    await pipeline.deliver(segment('thanks', { word: 'send', gapMs: 900 }));
    expect(log.at(-1)).toBe('key cmd+shift+d');
  });

  it('runs "new line" at once, without the chip (Safe level)', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('first point', { word: 'newline', gapMs: 700 }));
    expect(log).toEqual(['llm first point', 'insert First point.', 'key shift+enter']);
  });

  it('keeps "send" as text without a pause', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('reply', { word: 'send', gapMs: 100 }));
    expect(log).toEqual(['llm reply send', 'insert Reply send.']);
  });

  it('never presses Enter in Terminal: the word is typed instead', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [context('com.apple.Terminal')] });
    await pipeline.deliver(segment('git status', { word: 'enter', gapMs: 900 }));
    expect(log).toEqual(['insert git status enter']);
    expect(outcomes[0]?.routing.keptAsText).toBe('not_allowed');
  });

  it('actions are off in a meeting app: dictation still works, "send" stays text', async () => {
    const { pipeline, log } = setup({ contexts: [context('us.zoom.xos')] });
    await pipeline.deliver(segment('see you soon', send));
    expect(log).toEqual(['llm see you soon send', 'insert See you soon send.']);
  });
});

describe('UtterancePipeline: password fields', () => {
  const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });

  it('refuses to type into a password field, before any AI call', async () => {
    const { pipeline, log } = setup({ contexts: [password] });
    await expect(pipeline.deliver(segment('hunter two'))).rejects.toBeInstanceOf(SafetyRefusal);
    expect(log).toEqual([]);
  });

  it('refuses if the focus moves into a password field while the AI is cleaning up', async () => {
    const { pipeline, log } = setup({ contexts: [slack, password] });
    await expect(pipeline.deliver(segment('hello there'))).rejects.toBeInstanceOf(SafetyRefusal);
    expect(log).toEqual(['llm hello there']);
  });

  it('never presses a key in a password field: "send" there is only text, and typing is refused', async () => {
    const { pipeline, log } = setup({ contexts: [password] });
    await expect(pipeline.deliver(segment('', { word: 'send', gapMs: 0 }))).rejects.toBeInstanceOf(
      SafetyRefusal,
    );
    expect(log).toEqual([]);
  });
});

describe('UtterancePipeline: the world changes while acting', () => {
  it('skips the command if the user switches app during the preview chip', async () => {
    // reads: start, before insert, before command, after chip
    const { pipeline, log, outcomes } = setup({
      contexts: [slack, slack, slack, context('com.apple.mail')],
    });
    await pipeline.deliver(segment('see you soon', send));
    expect(log).toEqual(['llm see you soon', 'insert See you soon.', 'chip Send 1000']);
    expect(outcomes[0]?.command).toEqual({
      id: 'send',
      result: 'skipped',
      reason: 'context_changed',
    });
  });

  it('skips the command if the app became Terminal before it ran', async () => {
    const { pipeline, log, outcomes } = setup({
      contexts: [slack, slack, context('com.apple.Terminal')],
    });
    await pipeline.deliver(segment('see you soon', send));
    expect(log).toEqual(['llm see you soon', 'insert See you soon.']);
    expect(outcomes[0]?.command).toEqual({ id: 'send', result: 'skipped', reason: 'blocked_app' });
  });
});
