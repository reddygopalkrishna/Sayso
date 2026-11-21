import { endCommands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { UtterancePipeline, type UtteranceOutcome } from './UtterancePipeline.ts';
import { TextCleanup } from './cleanup/TextCleanup.ts';
import type { LLMProvider } from './cleanup/types.ts';
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

function setup(
  bundleId: string | null,
  llm = (raw: string) => `${raw[0]?.toUpperCase() ?? ''}${raw.slice(1)}.`,
) {
  const log: string[] = [];
  const outcomes: UtteranceOutcome[] = [];
  const provider: LLMProvider = { name: 'fake', model: 'f', cleanup: async (r) => llm(r.rawText) };
  const pipeline = new UtterancePipeline({
    readContext: async () => ({ bundleId, appName: 'App' }),
    cleanup: new TextCleanup({ provider, level: () => 'full' }),
    actions: {
      insertText: async (t) => void log.push(`insert ${t}`),
      pressKey: async (k, m) => void log.push(`key ${[...m, k].join('+')}`),
    },
    endCommands,
    pauseMs: () => 600,
    onOutcome: (o) => outcomes.push(o),
  });
  return { pipeline, log, outcomes };
}

const slack = 'com.tinyspeck.slackmacgap';

describe('UtterancePipeline', () => {
  it('cleans and inserts plain dictation', async () => {
    const { pipeline, log } = setup(slack);
    await pipeline.deliver(segment('hello there'));
    expect(log).toEqual(['insert Hello there.']);
  });

  it('inserts the text, then sends, when "send" follows a pause', async () => {
    const { pipeline, log, outcomes } = setup(slack);
    await pipeline.deliver(segment('see you soon', { word: 'send', gapMs: 800 }));
    expect(log).toEqual(['insert See you soon.', 'key enter']);
    expect(outcomes[0]?.ranCommand).toBe('send');
  });

  it('cleans only the text part: the command never reaches the LLM', async () => {
    const seen: string[] = [];
    const { pipeline } = setup(slack, (raw) => {
      seen.push(raw);
      return raw;
    });
    await pipeline.deliver(segment('see you soon', { word: 'send', gapMs: 800 }));
    expect(seen).toEqual(['see you soon']);
  });

  it('sends with the mail app shortcut in Mail', async () => {
    const { pipeline, log } = setup('com.apple.mail');
    await pipeline.deliver(segment('thanks', { word: 'send', gapMs: 900 }));
    expect(log).toEqual(['insert Thanks.', 'key cmd+shift+d']);
  });

  it('runs a command said on its own without inserting anything', async () => {
    const { pipeline, log } = setup(slack);
    await pipeline.deliver(segment('', { word: 'send', gapMs: 0 }));
    expect(log).toEqual(['key enter']);
  });

  it('keeps "send" as text without a pause', async () => {
    const { pipeline, log } = setup(slack);
    await pipeline.deliver(segment('reply', { word: 'send', gapMs: 100 }));
    expect(log).toEqual(['insert Reply send.']);
  });

  it('never presses Enter in Terminal: the word is typed instead', async () => {
    const { pipeline, log, outcomes } = setup('com.apple.Terminal');
    await pipeline.deliver(segment('git status', { word: 'enter', gapMs: 900 }));
    expect(log).toEqual(['insert git status enter']);
    expect(outcomes[0]?.routing.keptAsText).toBe('not_allowed');
  });

  it('new line presses Shift+Enter', async () => {
    const { pipeline, log } = setup(slack);
    await pipeline.deliver(segment('first point', { word: 'newline', gapMs: 700 }));
    expect(log).toEqual(['insert First point.', 'key shift+enter']);
  });
});
