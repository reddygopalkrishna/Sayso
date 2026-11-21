import { commands, endCommands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { UtterancePipeline, type UtteranceOutcome } from './UtterancePipeline.ts';
import { TextCleanup } from './cleanup/TextCleanup.ts';
import type { LLMProvider } from './cleanup/types.ts';
import type { DictionaryTerm } from './cleanup/dictionary.ts';
import { CommandEngine } from './commands/CommandEngine.ts';
import { CommandFailed, CommandNotUnderstood, CommandRefused } from './commands/errors.ts';
import type { AppContext } from './context/HelperContext.ts';
import { resolveOpen, resolveSwitch, type KnownApp } from './resolver/AppResolver.ts';
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
  dictionary?: DictionaryTerm[];
}

const installedApps: KnownApp[] = [
  { name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', running: true },
  { name: 'Safari', bundleId: 'com.apple.Safari', running: true },
  { name: 'Calculator', bundleId: 'com.apple.calculator', running: false },
  { name: 'Claude', bundleId: 'com.anthropic.claudefordesktop', running: true },
];

function setup({ contexts, chip = 'proceed', llm, dictionary }: Setup) {
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
      scroll: async (d, a) => void log.push(`scroll ${d} ${a}`),
      pressElement: async (l) => void log.push(`press ${l}`),
      listApps: async () => [],
      openApp: async (id) => void log.push(`openApp ${id}`),
      activateApp: async (id) => void log.push(`activate ${id}`),
      openUrl: async (u) => void log.push(`openUrl ${u}`),
    },
    chip: {
      confirm: async (label, ms) => {
        log.push(`chip ${label} ${ms}`);
        return chip;
      },
    },
    endCommands,
    engine: new CommandEngine(commands),
    settleMs: () => 0,
    dictionary: () => dictionary ?? [],
    resolver: {
      resolveOpen: async (t) => resolveOpen(t, installedApps),
      resolveSwitch: async (n) => resolveSwitch(n, installedApps),
    },
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
    expect(outcomes[0]?.routing?.keptAsText).toBe('not_allowed');
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

/** Command mode (Fn+Shift): the whole utterance is a command; nothing is ever typed. */
describe('UtterancePipeline: chained commands', () => {
  const said = (text: string) => segment(text);

  it('runs every step in order', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('undo, redo'), 'command');
    expect(t.log).toEqual(['key cmd+z', 'key cmd+shift+z']);
    expect(t.outcomes[0]?.command?.result).toBe('ran');
  });

  it('runs an app and then a key on it', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('open Slack, new tab'), 'command');
    expect(t.log).toEqual(['openApp com.tinyspeck.slackmacgap', 'key cmd+t']);
  });

  it('stops at the first refused step: the later steps never run', async () => {
    const t = setup({ contexts: [context('com.apple.Terminal')] });
    const error = await t.pipeline
      .deliver(said('copy that, close tab, paste'), 'command')
      .catch((e) => e);
    expect(error).toBeInstanceOf(CommandRefused);
    expect(t.log).toEqual(['key cmd+c']);
  });

  it('runs nothing when any part is not a command', async () => {
    const t = setup({ contexts: [slack] });
    const error = await t.pipeline
      .deliver(said('undo, hello there'), 'command')
      .catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(t.log).toEqual([]);
  });

  it('a single command still runs exactly as before', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('undo'), 'command');
    expect(t.log).toEqual(['key cmd+z']);
  });
});

describe('UtterancePipeline: command mode', () => {
  const said = (text: string) => segment(text);
  const run = async (text: string, over: Partial<Setup> = {}) => {
    const t = setup({ contexts: [slack], ...over });
    await t.pipeline.deliver(said(text), 'command');
    return t;
  };

  it.each([
    ['undo', ['key cmd+z']],
    ['redo.', ['key cmd+shift+z']],
    ['select all', ['key cmd+a']],
    ['copy that', ['key cmd+c']],
    ['paste', ['key cmd+v']],
    ['new tab', ['key cmd+t']],
    ['scroll down', ['scroll down 600']],
    ['go back', ['key cmd+leftBracket']],
    ['go forward.', ['key cmd+rightBracket']],
    ['Scroll up.', ['scroll up 600']],
    ['cancel', []],
    ['never mind', []],
  ])('safe command %j runs at once, without the chip', async (text, expected) => {
    const { log, outcomes } = await run(text);
    expect(log).toEqual(expected);
    expect(outcomes[0]?.mode).toBe('command');
    expect(outcomes[0]?.inserted).toBe(false);
    expect(outcomes[0]?.command?.result).toBe('ran');
  });

  it.each([
    ['delete that', 'Delete selection', ['key delete']],
    ['close tab', 'Close tab', ['key cmd+w']],
    ['click Submit', 'Click “submit”', ['press submit']],
    ['press the Save button', 'Click “save”', ['press save']],
    ['send', 'Send', ['key enter']],
  ])('normal command %j shows the chip first', async (text, label, expected) => {
    const { log } = await run(text);
    expect(log).toEqual([`chip ${label} 1000`, ...expected]);
  });

  it('Esc on the chip cancels and types nothing', async () => {
    const { log, outcomes } = await run('click Submit', { chip: 'cancelled' });
    expect(log).toEqual(['chip Click “submit” 1000']);
    expect(outcomes[0]?.command).toEqual({ id: 'click', result: 'cancelled' });
  });

  it('opens an installed app, a known site, and a spelled-out domain', async () => {
    expect((await run('open Slack')).log).toEqual(['openApp com.tinyspeck.slackmacgap']);
    expect((await run('open GitHub')).log).toEqual(['openUrl https://github.com']);
    expect((await run('open example dot com')).log).toEqual(['openUrl https://example.com']);
    expect((await run('open flibber jabber')).log).toEqual([
      'openUrl https://www.google.com/search?q=flibber%20jabber',
    ]);
  });

  it('switches to a running app and says so when it is not running', async () => {
    expect((await run('switch to Safari')).log).toEqual(['activate com.apple.Safari']);
    await expect(run('switch to Calculator')).rejects.toBeInstanceOf(CommandFailed);
    await expect(run('switch to Calculator')).rejects.toThrow('calculator is not running.');
  });

  it('tells you when it did not catch a command, and types nothing', async () => {
    const t = setup({ contexts: [slack] });
    const error = await t.pipeline
      .deliver(said('hello there how are you'), 'command')
      .catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(error.message).toBe("Didn't catch a command: “hello there how are you”");
    expect(t.log).toEqual([]);
  });

  it('dictation words are never typed in command mode', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('see you soon'), 'command').catch(() => undefined);
    expect(t.log.some((l) => l.startsWith('insert') || l.startsWith('llm'))).toBe(false);
  });

  it('refuses risky buttons and says why', async () => {
    const error = await run('click Delete').catch((e) => e);
    expect(error).toBeInstanceOf(CommandRefused);
    expect(error.reason).toBe('risky_label');
    expect(error.message).toBe('That button needs confirmation, which Sayso cannot ask for yet.');
  });

  it('refuses in a meeting app, a password field and Terminal (close tab), with the reason', async () => {
    const zoom = await run('undo', { contexts: [context('us.zoom.xos')] }).catch((e) => e);
    expect(zoom).toMatchObject({ name: 'CommandRefused', reason: 'meeting_app' });

    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    const pw = await run('copy', { contexts: [password] }).catch((e) => e);
    expect(pw).toMatchObject({ name: 'CommandRefused', reason: 'password_field' });

    const term = context('com.apple.Terminal');
    const closeTab = await run('close tab', { contexts: [term] }).catch((e) => e);
    expect(closeTab).toMatchObject({ name: 'CommandRefused', reason: 'blocked_app' });
    expect(closeTab.message).toBe('That command is not allowed in App.');
  });

  it('Terminal still allows safe commands such as paste', async () => {
    const { log } = await run('paste', { contexts: [context('com.apple.Terminal')] });
    expect(log).toEqual(['key cmd+v']);
  });

  it('"cancel" works even where actions are off', async () => {
    const { log } = await run('cancel', { contexts: [context('us.zoom.xos')] });
    expect(log).toEqual([]);
  });

  it('skips the command if the app changes during the chip', async () => {
    // reads: start, command check, after chip
    const { log, outcomes } = await run('click Submit', {
      contexts: [slack, slack, context('com.apple.mail')],
    });
    expect(log).toEqual(['chip Click “submit” 1000']);
    expect(outcomes[0]?.command).toEqual({
      id: 'click',
      result: 'skipped',
      reason: 'context_changed',
    });
  });
});

describe('UtterancePipeline: your dictionary also fixes spoken commands', () => {
  const claude: DictionaryTerm[] = [{ phrase: 'Claude', spokenAs: 'cloud' }];

  it('"open Cloud" opens the Claude app once the dictionary says Cloud sounds like Claude (a real mishearing)', async () => {
    const t = setup({ contexts: [slack], dictionary: claude });
    await t.pipeline.deliver(segment('Open Cloud'), 'command');
    expect(t.log).toEqual(['openApp com.anthropic.claudefordesktop']);
  });

  it('without the entry, the mishearing becomes a web search', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(segment('Open Cloud'), 'command');
    expect(t.log).toEqual(['openUrl https://www.google.com/search?q=cloud']);
  });

  it('does not change what is typed in the history: the raw words stay as heard', async () => {
    const t = setup({ contexts: [slack], dictionary: claude });
    await t.pipeline.deliver(segment('Open Cloud'), 'command');
    expect(t.outcomes[0]?.segment.text).toBe('Open Cloud');
  });

  it('a "sounds like" word fixes the command word it replaces, e.g. a name inside a label', async () => {
    const t = setup({ contexts: [slack], dictionary: [{ phrase: 'Kairo', spokenAs: 'kai row' }] });
    await t.pipeline.deliver(segment('click kai row'), 'command');
    expect(t.log).toEqual(['chip Click “kairo” 1000', 'press kairo']);
  });
});
