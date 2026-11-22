import { commands, endCommands } from '@sayso/command-grammar';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { toPlan, type Plan } from './interpret/plan.ts';
import type { ProfileKey } from '../../shared/profile.ts';
import { HelperRequestError } from '../helper/HelperProcess.ts';
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
  { name: 'WhatsApp', bundleId: 'net.whatsapp.WhatsApp', running: true },
  { name: 'Calculator', bundleId: 'com.apple.calculator', running: false },
  { name: 'Claude', bundleId: 'com.anthropic.claudefordesktop', running: true },
];

function setup({
  contexts,
  chip = 'proceed',
  llm,
  dictionary,
  confirmMs,
  snippets,
  styles,
  interpret,
  profile,
  settleMs = 0,
  pageWaitMs = 0,
  appReadyMs = 0,
  messageSpeed = 0,
  apps,
  contextFor,
}: Setup & {
  confirmMs?: number;
  settleMs?: number;
  pageWaitMs?: number;
  appReadyMs?: number;
  messageSpeed?: number;
  apps?: KnownApp[];
  /** The context to return, decided from what has happened so far (instead of counting reads). */
  contextFor?: (log: readonly string[]) => AppContext;
  snippets?: Record<string, string>;
  styles?: Record<string, 'default' | 'chill'>;
  interpret?: (utterance: string) => Plan | null | Promise<Plan | null>;
  profile?: Partial<Record<ProfileKey, string>>;
}) {
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
    readContext: async () =>
      contextFor
        ? contextFor(log)
        : (contexts[Math.min(reads++, contexts.length - 1)] ?? context(null)),
    cleanup: new TextCleanup({ provider, level: () => 'full' }),
    actions: {
      insertText: async (t) => void log.push(`insert ${t}`),
      pressKey: async (k, m) => void log.push(`key ${[...m, k].join('+')}`),
      scroll: async (d, a) => void log.push(`scroll ${d} ${a}`),
      pressElement: async (l) => void log.push(`press ${l}`),
      focusField: async (label) => {
        if (label === 'Nowhere') throw new HelperRequestError('element_not_found', 'none');
        log.push(`focus ${label}`);
      },
      pressPosition: async (k, i) => {
        if (i === 9) {
          throw new HelperRequestError('element_not_found', 'nothing there');
        }
        log.push(`position ${k} ${i}`);
      },
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
    settleMs: () => settleMs,
    pageWaitMs: () => pageWaitMs,
    appReadyMs: () => appReadyMs,
    messageSpeed: () => messageSpeed,
    profileValue: (key) => profile?.[key] ?? null,
    ...(interpret
      ? {
          interpret: async (utterance: string) => {
            log.push(`interpret ${utterance}`);
            return interpret(utterance);
          },
        }
      : {}),
    style: (bundleId) => (bundleId ? styles?.[bundleId] : undefined) ?? 'default',
    snippets: {
      find: (spoken) =>
        snippets?.[
          spoken
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .trim()
        ] ?? null,
    },
    confirmMs: () => confirmMs ?? 8_000,
    onAwaitConfirm: (prompt, ms) => void log.push(`prompt ${prompt} ${ms}`),
    onConfirmEnd: () => void log.push('prompt end'),
    dictionary: () => dictionary ?? [],
    resolver: {
      resolveOpen: async (t) => resolveOpen(t, apps ?? installedApps),
      resolveSwitch: async (n) => resolveSwitch(n, apps ?? installedApps),
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

  it('joins pieces told one after another with a space, and starts clean after a command', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('hello there'));
    await pipeline.deliver(segment('how are you'));
    expect(log.filter((entry) => entry.startsWith('insert'))).toEqual([
      'insert Hello there.',
      'insert  How are you.',
    ]);
    await pipeline.deliver(segment('see you soon', send));
    await pipeline.deliver(segment('next message'));
    const inserts = log.filter((entry) => entry.startsWith('insert'));
    expect(inserts.at(-1)).toBe('insert Next message.');
  });

  it('"type … hit enter" in one breath: text typed, then Enter, when the pause is waived', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    const said = segment('aws', { word: 'send', gapMs: 50 });
    await pipeline.deliver({ ...said, relaxPause: true });
    expect(log).toEqual(['llm aws', 'insert Aws.', 'chip Send 1000', 'key enter']);
  });

  it('without the waiver the same words stay text (nothing is sent by accident)', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('aws', { word: 'send', gapMs: 50 }));
    expect(log.some((entry) => entry.startsWith('key'))).toBe(false);
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

describe('UtterancePipeline: your own words (the interpreter)', () => {
  const said = (text: string) => segment(text);
  const plan = (steps: unknown[]): Plan => {
    const result = toPlan({ steps });
    if (!result) throw new Error('bad test plan');
    return result;
  };

  it('runs the plan when no exact command matched', async () => {
    const t = setup({
      contexts: [slack],
      interpret: () =>
        plan([{ command: 'new_tab' }, { type: 'aws console' }, { command: 'enter' }]),
    });
    await t.pipeline.deliver(said('please set up a fresh search for aws console'), 'command');
    expect(t.log).toEqual([
      'interpret please set up a fresh search for aws console',
      'key cmd+t',
      'insert aws console',
      'chip Press Enter 1000',
      'key enter',
    ]);
  });

  it('a click step goes through the preview chip like a spoken click', async () => {
    const t = setup({
      contexts: [slack],
      interpret: () => plan([{ command: 'click', arg: 'Sign in' }]),
    });
    await t.pipeline.deliver(said('log me in'), 'command');
    expect(t.log).toEqual(['interpret log me in', 'chip Click “sign in” 1000', 'press sign in']);
  });

  it('a risky button the AI picked still waits for "yes"', async () => {
    const t = setup({
      contexts: [slack],
      interpret: () => plan([{ command: 'click', arg: 'Delete account' }]),
    });
    await t.pipeline.deliver(said('get rid of my account'), 'command');
    expect(t.log.some((line) => line.startsWith('press'))).toBe(false);
    expect(t.log.some((line) => line.startsWith('prompt Say “yes”'))).toBe(true);
  });

  it('an exact command never asks the interpreter', async () => {
    const t = setup({ contexts: [slack], interpret: () => plan([{ command: 'new_tab' }]) });
    await t.pipeline.deliver(said('undo'), 'command');
    expect(t.log).toEqual(['key cmd+z']);
  });

  it.each([
    ['nothing usable', () => null],
    ['an error', () => Promise.reject(new Error('down'))],
  ])('says it did not catch that when the interpreter gives %s', async (_label, interpret) => {
    const t = setup({ contexts: [slack], interpret });
    const error = await t.pipeline.deliver(said('do the thing'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(t.log).toEqual(['interpret do the thing']);
  });

  it('is never asked in a password field or a meeting app', async () => {
    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    for (const where of [password, context('us.zoom.xos')]) {
      const t = setup({ contexts: [where], interpret: () => plan([{ command: 'new_tab' }]) });
      await expect(t.pipeline.deliver(said('do the thing'), 'command')).rejects.toBeInstanceOf(
        CommandNotUnderstood,
      );
      expect(t.log).toEqual([]);
    }
  });

  it('a typed step is refused in a password field that appears mid-plan', async () => {
    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    const t = setup({
      contexts: [slack, slack, password],
      interpret: () => plan([{ command: 'new_tab' }, { type: 'hunter2' }]),
    });
    await expect(
      t.pipeline.deliver(said('make me a fresh tab and write my secret in it'), 'command'),
    ).rejects.toBeInstanceOf(SafetyRefusal);
    expect(t.log.some((line) => line.startsWith('insert'))).toBe(false);
  });

  it('works without an interpreter (as before)', async () => {
    const t = setup({ contexts: [slack] });
    await expect(t.pipeline.deliver(said('do the thing'), 'command')).rejects.toBeInstanceOf(
      CommandNotUnderstood,
    );
  });
});

describe('UtterancePipeline: fill in my details', () => {
  const said = (text: string) => segment(text);
  const fillPlan = (...steps: Array<[string, string]>): Plan => {
    const plan = toPlan({ steps: steps.map(([fill, from]) => ({ fill, from })) });
    if (!plan) throw new Error('bad test plan');
    return plan;
  };
  const profile = { name: 'Keshav Reddy', email: 'keshav@example.com', phone: '+91 98765 43210' };

  it('puts the cursor in each field and types the saved fact', async () => {
    const t = setup({
      contexts: [slack],
      profile,
      interpret: () => fillPlan(['Full name', 'name'], ['Email', 'email'], ['Mobile', 'phone']),
    });
    await t.pipeline.deliver(said('fill in my details'), 'command');
    expect(t.log).toEqual([
      'interpret fill in my details',
      'focus Full name',
      'insert Keshav Reddy',
      'focus Email',
      'insert keshav@example.com',
      'focus Mobile',
      'insert +91 98765 43210',
    ]);
  });

  it('says what is missing when a fact is not saved, and types nothing', async () => {
    const t = setup({
      contexts: [slack],
      profile: { name: 'Keshav Reddy' },
      interpret: () => fillPlan(['Email', 'email']),
    });
    const error = await t.pipeline.deliver(said('fill in my email'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toBe('Your email is not saved yet. Add it in About me.');
    expect(t.log.some((line) => line.startsWith('insert') || line.startsWith('focus'))).toBe(false);
  });

  it('says when there is no such field on screen', async () => {
    const t = setup({ contexts: [slack], profile, interpret: () => fillPlan(['Nowhere', 'name']) });
    const error = await t.pipeline.deliver(said('fill in my name'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toBe('There is no field called “Nowhere” on screen.');
    expect(t.log.some((line) => line.startsWith('insert'))).toBe(false);
  });

  it('never types into a password field, even one the cursor lands in', async () => {
    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    // Before: refused at once. After the cursor moves into a password field: refused before pasting.
    for (const contexts of [[password], [slack, slack, password]]) {
      const t = setup({ contexts, profile, interpret: () => fillPlan(['Email', 'email']) });
      await t.pipeline.deliver(said('fill in my email'), 'command').catch(() => undefined);
      expect(t.log.some((line) => line.startsWith('insert'))).toBe(false);
    }
  });

  it('is refused in a meeting app', async () => {
    const t = setup({
      contexts: [context('us.zoom.xos')],
      profile,
      interpret: () => fillPlan(['Email', 'email']),
    });
    await t.pipeline.deliver(said('fill in my email'), 'command').catch(() => undefined);
    expect(t.log.some((line) => line.startsWith('insert') || line.startsWith('focus'))).toBe(false);
  });
});

describe('UtterancePipeline: position commands', () => {
  const said = (text: string) => segment(text);
  const run = async (text: string) => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said(text), 'command');
    return t;
  };

  it.each([
    ['open the third email', 'row 3'],
    ['open the first result', 'result 1'],
    ['click the second link', 'link 2'],
    ['open first result', 'result 1'],
    ['go to the last message', 'row -1'],
    ['select the 2nd one', 'any 2'],
  ])('%j opens %s, after the preview chip', async (text, expected) => {
    const { log } = await run(text);
    expect(log.at(-1)).toBe(`position ${expected}`);
    expect(log[0]).toMatch(/^chip Open the /);
  });

  it('"open the App Store" still opens the app, it is not a position', async () => {
    const { log } = await run('open the app store');
    expect(log.some((line) => line.startsWith('position'))).toBe(false);
  });

  it('says plainly when there is no such item on screen', async () => {
    const t = setup({ contexts: [slack] });
    const error = await t.pipeline.deliver(said('open the ninth email'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toBe('There is no ninth email on screen.');
  });
});

describe('UtterancePipeline: "type …" with the hold key', () => {
  it('types the rest as said, with no AI', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('type chatgpt.com'));
    expect(log).toEqual(['insert chatgpt.com']);
    expect(outcomes[0]?.insertedText).toBe('chatgpt.com');
    expect(outcomes[0]?.cleanup).toBeNull();
  });

  it('fixes a misheard name and a spoken web address', async () => {
    const { pipeline, log } = setup({
      contexts: [slack],
      dictionary: [{ phrase: 'ChatGPT', spokenAs: 'chart gpt' }],
    });
    await pipeline.deliver(segment('Type chart gpt dot com.'));
    expect(log).toEqual(['insert chatgpt.com']);
  });

  it('"type my email" types the saved fact (a snippet or a fact about you)', async () => {
    const { pipeline, log } = setup({
      contexts: [slack],
      snippets: { 'my email': 'keshav@example.com' },
    });
    await pipeline.deliver(segment('Type my email.'));
    expect(log).toEqual(['insert keshav@example.com']);
  });

  it('"my email" alone is typed the same way (hands-free strips "type")', async () => {
    const { pipeline, log } = setup({
      contexts: [slack],
      snippets: { 'my email': 'keshav@example.com' },
    });
    await pipeline.deliver(segment('my email'));
    expect(log).toEqual(['insert keshav@example.com']);
  });

  it('a trailing "send" is typed as a word, never pressed', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('type see you soon', send));
    expect(log).toEqual(['insert see you soon send']);
  });

  it('is never typed into a password field', async () => {
    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    const { pipeline, log } = setup({ contexts: [password] });
    await expect(pipeline.deliver(segment('type hunter2'))).rejects.toBeInstanceOf(SafetyRefusal);
    expect(log).toEqual([]);
  });

  it('"type" inside a sentence is ordinary dictation', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('I will type it later'));
    expect(log).toEqual(['llm I will type it later', 'insert I will type it later.']);
  });
});

describe('UtterancePipeline: web addresses in dictation', () => {
  it('a spoken address comes out as an address', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('go to chatgpt dot com'));
    expect(log).toEqual(['llm go to chatgpt dot com', 'insert Go to chatgpt.com.']);
  });

  it('an address said alone has no capital and no full stop', async () => {
    const { pipeline, log } = setup({ contexts: [slack] });
    await pipeline.deliver(segment('github dot com'));
    expect(log).toEqual(['llm github dot com', 'insert github.com']);
  });
});

describe('UtterancePipeline: style', () => {
  const styles = { 'com.tinyspeck.slackmacgap': 'chill' } as const;

  it('chill: no capitals and no sentence punctuation in an app set to chill', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [slack], styles });
    await pipeline.deliver(segment('hello there'));
    expect(log).toEqual(['llm hello there', 'insert hello there']);
    expect(outcomes[0]?.insertedText).toBe('hello there');
  });

  it('default: other apps keep capitals and punctuation', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [context('com.apple.Notes')], styles });
    await pipeline.deliver(segment('hello there'));
    expect(log).toEqual(['llm hello there', 'insert Hello there.']);
    expect(outcomes[0]?.insertedText).toBeUndefined();
  });

  it('chill keeps your own words spelled your way', async () => {
    const { pipeline, log } = setup({
      contexts: [slack],
      styles,
      dictionary: [{ phrase: 'Priya', spokenAs: null }],
      llm: () => 'Ask Priya about it.',
    });
    await pipeline.deliver(segment('ask priya about it'));
    expect(log).toEqual(['llm ask priya about it', 'insert ask Priya about it']);
  });

  it('a snippet is typed exactly as saved, even in a chill app', async () => {
    const { pipeline, log } = setup({
      contexts: [slack],
      styles,
      snippets: { calendly: 'Book a time: https://Calendly.com/Me' },
    });
    await pipeline.deliver(segment('calendly'));
    expect(log).toEqual(['insert Book a time: https://Calendly.com/Me']);
  });
});

describe('UtterancePipeline: snippets', () => {
  const link = { calendly: 'Book a time: https://calendly.com/me' };

  it('types the saved text for a trigger, with no AI', async () => {
    const { pipeline, log, outcomes } = setup({ contexts: [slack], snippets: link });
    await pipeline.deliver(segment('Calendly.'));
    expect(log).toEqual(['insert Book a time: https://calendly.com/me']);
    expect(outcomes[0]?.inserted).toBe(true);
    expect(outcomes[0]?.insertedText).toBe('Book a time: https://calendly.com/me');
    expect(outcomes[0]?.cleanup).toBeNull();
  });

  it('a trigger inside a longer sentence is just dictation', async () => {
    const { pipeline, log } = setup({ contexts: [slack], snippets: link });
    await pipeline.deliver(segment('send me my calendly'));
    expect(log).toEqual(['llm send me my calendly', 'insert Send me my calendly.']);
  });

  it('a trigger followed by "send" after a pause types the text, then sends', async () => {
    const { pipeline, log } = setup({ contexts: [slack], snippets: link });
    await pipeline.deliver(segment('calendly', send));
    expect(log).toEqual([
      'insert Book a time: https://calendly.com/me',
      'chip Send 1000',
      'key enter',
    ]);
  });

  it('never types a snippet into a password field', async () => {
    const password = context('com.apple.Safari', { focusRole: 'AXTextField', secureField: true });
    const { pipeline, log } = setup({ contexts: [password], snippets: link });
    await expect(pipeline.deliver(segment('calendly'))).rejects.toBeInstanceOf(SafetyRefusal);
    expect(log).toEqual([]);
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
    const error = await t.pipeline.deliver(said('undo, hello there'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(t.log).toEqual([]);
  });

  it('a single command still runs exactly as before', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('undo'), 'command');
    expect(t.log).toEqual(['key cmd+z']);
  });
});

describe('UtterancePipeline: a clipped command word', () => {
  it.each([
    ['Open.', 'Open what?'],
    ['click', 'Click what?'],
    ['Open it', 'Open what?'],
  ])('%j asks "%s" and does not call the interpreter', async (heard, ask) => {
    const t = setup({
      contexts: [slack],
      interpret: () => toPlan({ steps: [{ command: 'new_tab' }] }),
    });
    const error = await t.pipeline.deliver(segment(heard), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(error.message).toContain(ask);
    expect(t.log.filter((l) => l.startsWith('interpret') || l.startsWith('key'))).toEqual([]);
  });

  it('a sentence the interpreter can handle still goes to it', async () => {
    const t = setup({
      contexts: [slack],
      interpret: () => toPlan({ steps: [{ command: 'new_tab' }] }),
    });
    await t.pipeline.deliver(segment('make me a fresh tab'), 'command');
    expect(t.log).toContain('key cmd+t');
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
    ['take a screenshot', ['key cmd+shift+3']],
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
    ['lock screen', 'Lock screen', ['key cmd+ctrl+q']],
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

  it('a risky button asks for "yes" and presses nothing yet', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('click Delete'), 'command');
    expect(t.log).toEqual(['prompt Say “yes” to press “delete” 8000']);
    expect(t.outcomes[0]?.command).toEqual({ id: 'click', result: 'awaiting' });
  });

  it('"yes" presses it once, in the same app', async () => {
    const t = setup({ contexts: [slack, slack, slack] });
    await t.pipeline.deliver(said('click Delete'), 'command');
    await t.pipeline.deliver(said('yes'), 'command');
    expect(t.log).toEqual([
      'prompt Say “yes” to press “delete” 8000',
      'prompt end',
      'press delete',
    ]);
    expect(t.outcomes.at(-1)?.command).toEqual({ id: 'click', result: 'ran' });
  });

  it('"yes" with nothing waiting does nothing and says so', async () => {
    const t = setup({ contexts: [slack] });
    const error = await t.pipeline.deliver(said('yes'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toBe('Nothing is waiting for “yes”.');
    expect(t.log).toEqual([]);
  });

  it('the wait expires: a late "yes" presses nothing', async () => {
    const t = setup({ contexts: [slack], confirmMs: 20 });
    await t.pipeline.deliver(said('click Delete'), 'command');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const error = await t.pipeline.deliver(said('yes'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(t.log).toEqual(['prompt Say “yes” to press “delete” 20', 'prompt end']);
  });

  it('any other command ends the wait: a later "yes" presses nothing', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('click Delete'), 'command');
    await t.pipeline.deliver(said('undo'), 'command');
    const error = await t.pipeline.deliver(said('yes'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(t.log).toEqual(['prompt Say “yes” to press “delete” 8000', 'prompt end', 'key cmd+z']);
  });

  it('if the app changed before "yes", nothing is pressed', async () => {
    const safari = context('com.apple.Safari');
    const t = setup({ contexts: [slack, slack, slack, safari] });
    await t.pipeline.deliver(said('click Delete'), 'command');
    const error = await t.pipeline.deliver(said('yes'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toBe('The app changed, so nothing was pressed.');
    expect(t.log.some((line) => line.startsWith('press'))).toBe(false);
  });

  it('Esc (cancelPending) drops the wait', async () => {
    const t = setup({ contexts: [slack] });
    await t.pipeline.deliver(said('click Delete'), 'command');
    t.pipeline.cancelPending();
    const error = await t.pipeline.deliver(said('yes'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(t.log).toEqual(['prompt Say “yes” to press “delete” 8000', 'prompt end']);
  });

  it('a risky button in a meeting app is refused outright: no prompt', async () => {
    const t = setup({ contexts: [context('us.zoom.xos')] });
    const error = await t.pipeline.deliver(said('click Delete'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandRefused);
    expect(t.log).toEqual([]);
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

describe('UtterancePipeline: waiting for pages to load between steps', () => {
  const safari = context('com.apple.Safari');
  afterEach(() => vi.useRealTimers());
  /** What was done, without the preview-chip lines. */
  const actions = (log: readonly string[]): string[] => log.filter((l) => !l.startsWith('chip '));

  /** Runs a chain with fake timers; returns the log after each of the given waits. */
  async function logsAfter(text: string, ctx: AppContext, waits: number[]): Promise<string[][]> {
    vi.useFakeTimers();
    const t = setup({ contexts: [ctx], settleMs: 300, pageWaitMs: 1_800 });
    const done = t.pipeline.deliver(segment(text), 'command');
    await vi.advanceTimersByTimeAsync(0);
    const seen: string[][] = [actions(t.log)];
    for (const ms of waits) {
      await vi.advanceTimersByTimeAsync(ms);
      seen.push(actions(t.log));
    }
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    return seen;
  }

  it.each([
    ['enter in a browser', 'enter, scroll down', 'key enter'],
    ['send in a browser', 'send it, scroll down', 'key enter'],
    ['a click in a browser', 'click Sign in, scroll down', 'press sign in'],
    ['open the first result', 'open the first result, scroll down', 'position result 1'],
    ['opening a website', 'open github, scroll down', 'openUrl https://github.com'],
  ])('%s: the next step waits 1.8 s', async (_name, text, first) => {
    const [at0, at1799, at1800] = await logsAfter(text, safari, [1_799, 1]);
    expect(at0).toEqual([first]);
    expect(at1799).toEqual([first]);
    expect(at1800).toEqual([first, 'scroll down 600']);
  });

  it.each([
    ['new tab in a browser', 'new tab, scroll down', 'key cmd+t'],
    ['scrolling', 'scroll down, scroll up', 'scroll down 600'],
    ['going back', 'go back, scroll down', 'key cmd+leftBracket'],
    ['opening an app', 'open Slack, scroll down', 'openApp com.tinyspeck.slackmacgap'],
  ])('%s: the next step waits only the short 0.3 s', async (_name, text, first) => {
    const [at0, at299, at300] = await logsAfter(text, safari, [299, 1]);
    expect(at0).toEqual([first]);
    expect(at299).toEqual([first]);
    expect(at300?.length).toBe(2);
  });

  it('enter outside a browser is quick (a chat is not a page load)', async () => {
    const [at0, , at300] = await logsAfter(
      'enter, scroll down',
      context('com.tinyspeck.slackmacgap'),
      [299, 1],
    );
    expect(at0).toEqual(['key enter']);
    expect(at300?.length).toBe(2);
  });

  it('a page wait of 0 turns the longer wait off', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [safari], settleMs: 0, pageWaitMs: 0 });
    const done = t.pipeline.deliver(segment('enter, scroll down'), 'command');
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(actions(t.log)).toEqual(['key enter', 'scroll down 600']);
  });

  it('waits nothing after the last step', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [safari], settleMs: 300, pageWaitMs: 1_800 });
    let finished = false;
    const done = t.pipeline.deliver(segment('enter'), 'command').then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
    await done;
  });
});

describe('UtterancePipeline: waiting for an opened app to come to the front', () => {
  afterEach(() => vi.useRealTimers());
  const chrome = context('com.google.Chrome');
  const slackCtx = context('com.tinyspeck.slackmacgap');

  it('waits until the app is in front, then runs the next step', async () => {
    vi.useFakeTimers();
    // Chrome is in front for the first reads; Slack takes over on the fourth.
    const t = setup({ contexts: [chrome, chrome, chrome, slackCtx], appReadyMs: 3_000 });
    const done = t.pipeline.deliver(segment('open Slack, scroll down'), 'command');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.log.filter((l) => l.startsWith('scroll'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    expect(t.log.filter((l) => !l.startsWith('chip '))).toEqual([
      'openApp com.tinyspeck.slackmacgap',
      'scroll down 600',
    ]);
  });

  it('carries on after the limit when the app never comes to the front', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [chrome], appReadyMs: 1_000 });
    const done = t.pipeline.deliver(segment('open Slack, scroll down'), 'command');
    await vi.advanceTimersByTimeAsync(900);
    expect(t.log.some((l) => l.startsWith('scroll'))).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(t.log.some((l) => l.startsWith('scroll'))).toBe(true);
  });

  it('does not wait when the app is already in front', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [slackCtx], appReadyMs: 3_000 });
    const done = t.pipeline.deliver(segment('open Slack'), 'command');
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(t.log).toContain('openApp com.tinyspeck.slackmacgap');
  });

  it('does not poll for a website', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [chrome], appReadyMs: 3_000 });
    const done = t.pipeline.deliver(segment('open github'), 'command');
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(t.log).toContain('openUrl https://github.com');
  });
});

describe('UtterancePipeline: messaging recipes', () => {
  afterEach(() => vi.useRealTimers());
  const safari = context('com.apple.Safari');
  const slackCtx = context('com.tinyspeck.slackmacgap');
  const whatsapp = context('net.whatsapp.WhatsApp');
  const zoom = context('us.zoom.xos');
  const say = (text: string) => segment(text);
  const withoutChips = (log: readonly string[]) => log.filter((l) => !l.startsWith('chip '));

  it('Slack: open, ⌘K, name, Enter, text, chip, Enter', async () => {
    const t = setup({ contexts: [slackCtx] });
    await t.pipeline.deliver(say('message priya on slack i will be late'), 'command');
    expect(t.log).toEqual([
      'openApp com.tinyspeck.slackmacgap',
      'key cmd+k',
      'insert Priya',
      'key enter',
      'insert i will be late',
      'chip Send “i will be late” to Priya? 3000',
      'key enter',
    ]);
    expect(t.outcomes[0]?.command).toEqual({ id: 'send_message', result: 'ran' });
  });

  it('WhatsApp: ⌘F, name, Down, Enter, text, chip, Enter', async () => {
    const t = setup({ contexts: [whatsapp] });
    await t.pipeline.deliver(
      say('send a message to priya sharma on whatsapp saying call me'),
      'command',
    );
    expect(withoutChips(t.log)).toEqual([
      'openApp net.whatsapp.WhatsApp',
      'key cmd+f',
      'insert Priya Sharma',
      'key down',
      'key enter',
      'focus Compose message',
      'insert call me',
      'key enter',
    ]);
    expect(t.log).toContain('chip Send “call me” to Priya Sharma? 3000');
  });

  it('Esc on the chip cancels: the text is typed but Enter is not pressed to send', async () => {
    const t = setup({ contexts: [slackCtx], chip: 'cancelled' });
    await t.pipeline.deliver(say('message priya on slack saying hello'), 'command');
    expect(t.log.filter((l) => l === 'key enter')).toHaveLength(1); // only the pick, not the send
    expect(t.log.at(-1)).toBe('chip Send “hello” to Priya? 3000');
    expect(t.outcomes[0]?.command).toEqual({ id: 'send_message', result: 'cancelled' });
  });

  it('uses the messaging app in front when none is named', async () => {
    const t = setup({ contexts: [slackCtx] });
    await t.pipeline.deliver(say('message priya saying hello'), 'command');
    expect(t.log).toContain('openApp com.tinyspeck.slackmacgap');
    expect(t.outcomes[0]?.command?.result).toBe('ran');
  });

  it('asks which app when none is named and none is in front', async () => {
    const t = setup({ contexts: [safari] });
    const error = await t.pipeline
      .deliver(say('message priya saying hello'), 'command')
      .catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toContain('Say which app');
    expect(t.log).toEqual([]);
  });

  it('says so when the app is not installed', async () => {
    const t = setup({ contexts: [safari], apps: [] });
    const error = await t.pipeline
      .deliver(say('message priya on slack saying hello'), 'command')
      .catch((e) => e);
    expect(error).toBeInstanceOf(CommandFailed);
    expect(error.message).toContain('not installed');
    expect(t.log.filter((l) => l.startsWith('key') || l.startsWith('insert'))).toEqual([]);
  });

  it('a message with no text is not understood as a message command', async () => {
    const t = setup({ contexts: [slackCtx] });
    const error = await t.pipeline.deliver(say('message priya'), 'command').catch((e) => e);
    expect(error).toBeInstanceOf(CommandNotUnderstood);
    expect(t.log).toEqual([]);
  });

  it("works as the interpreter's plan, with the same chip", async () => {
    const t = setup({
      contexts: [slackCtx],
      interpret: () =>
        toPlan({ steps: [{ command: 'send_message', arg: 'Priya on Slack saying running late' }] }),
    });
    await t.pipeline.deliver(say('tell priya on slack i am running late'), 'command');
    expect(t.log).toContain('chip Send “running late” to Priya? 3000');
    expect(t.log.at(-1)).toBe('key enter');
  });

  describe('the message is exactly what was said', () => {
    const typedText = (log: readonly string[]) =>
      log.filter((l) => l.startsWith('insert ') && l !== 'insert Priya')[0];

    it.each([
      ['type', 'message Priya on Slack saying type hello there', 'type hello there'],
      ['send it', 'message Priya on Slack saying ok send it', 'ok send it'],
      ['open', 'message Priya on Slack saying open Slack and call me', 'open Slack and call me'],
      [
        'cancel words',
        'message Priya on Slack saying never mind, cancel that',
        'never mind, cancel that',
      ],
      [
        'an apostrophe and punctuation',
        "message Priya on Slack saying I'm late, sorry!",
        "I'm late, sorry!",
      ],
    ])('%s is typed as said, with no AI and no command run', async (_label, spoken, text) => {
      const t = setup({ contexts: [slackCtx] });
      await t.pipeline.deliver(say(spoken), 'command');
      expect(typedText(t.log)).toBe(`insert ${text}`);
      expect(t.log.some((l) => l.startsWith('llm'))).toBe(false);
      // Only the recipe's own keys ran: ⌘K, the pick, and the send. No new tab, no extra open.
      expect(t.log.filter((l) => l.startsWith('key'))).toEqual([
        'key cmd+k',
        'key enter',
        'key enter',
      ]);
      expect(t.log.filter((l) => l.startsWith('openApp'))).toEqual([
        'openApp com.tinyspeck.slackmacgap',
      ]);
      expect(t.log).toContain(`chip Send “${text}” to Priya? 3000`);
    });

    it('a web address in the message is formatted like dictation', async () => {
      const t = setup({ contexts: [slackCtx] });
      await t.pipeline.deliver(
        say('message Priya on Slack saying see www dot example dot com'),
        'command',
      );
      expect(typedText(t.log)).toBe('insert see www.example.com');
    });

    it('your own spellings are applied', async () => {
      const t = setup({
        contexts: [slackCtx],
        dictionary: [{ phrase: 'Sayso', spokenAs: 'say so' }],
      });
      await t.pipeline.deliver(say('message Priya on Slack saying try say so today'), 'command');
      expect(typedText(t.log)).toBe('insert try Sayso today');
    });

    it('a comma and "then" in the message do not cut it into commands', async () => {
      const t = setup({ contexts: [slackCtx] });
      await t.pipeline.deliver(
        say('message Priya on Slack saying call me, then send it'),
        'command',
      );
      expect(typedText(t.log)).toBe('insert call me, then send it');
      expect(t.outcomes[0]?.command).toEqual({ id: 'send_message', result: 'ran' });
    });

    it('"open Slack, message Priya saying …" runs the open, then the message', async () => {
      const t = setup({ contexts: [slackCtx] });
      await t.pipeline.deliver(say('open Slack, message Priya saying new tab'), 'command');
      expect(typedText(t.log)).toBe('insert new tab');
      expect(t.log.filter((l) => l.startsWith('openApp')).length).toBe(2);
      expect(t.log).not.toContain('key cmd+t');
    });

    describe('the interpreter can choose to send a message, but never writes it', () => {
      const plan = (arg: string) => toPlan({ steps: [{ command: 'send_message', arg }] });

      it('uses the words as said, replacing the AI’s version', async () => {
        const t = setup({
          contexts: [slackCtx],
          interpret: () => plan('priya on slack saying running late'),
        });
        await t.pipeline.deliver(say("Hey tell priya on slack I'm Running late!"), 'command');
        expect(typedText(t.log)).toBe('insert Running late!');
      });

      it('drops the whole plan when the AI changed the words', async () => {
        const t = setup({
          contexts: [slackCtx],
          interpret: () => plan('priya on slack saying i will be there in five minutes'),
        });
        const error = await t.pipeline
          .deliver(say('tell priya on slack I am running late'), 'command')
          .catch((e) => e);
        expect(error).toBeInstanceOf(CommandNotUnderstood);
        expect(t.log.filter((l) => l.startsWith('key') || l.startsWith('insert'))).toEqual([]);
      });

      it('drops the plan when the AI added a message the person never said', async () => {
        const t = setup({
          contexts: [slackCtx],
          interpret: () => plan('priya on slack saying transfer the money'),
        });
        const error = await t.pipeline
          .deliver(say('what is the weather like'), 'command')
          .catch((e) => e);
        expect(error).toBeInstanceOf(CommandNotUnderstood);
        expect(t.log.filter((l) => l.startsWith('key') || l.startsWith('insert'))).toEqual([]);
      });
    });
  });

  describe('safety matrix: nothing is typed or sent', () => {
    const noTyping = (log: readonly string[]) =>
      log.filter((l) => l.startsWith('insert') || l.startsWith('key') || l.startsWith('chip'));

    it.each([
      ['a meeting app is in front', [zoom]],
      ['a password field has the cursor', [context('com.apple.Safari', { secureField: true })]],
    ])('refused at the start when %s', async (_name, contexts) => {
      const t = setup({ contexts });
      const error = await t.pipeline
        .deliver(say('message priya on slack saying hello'), 'command')
        .catch((e) => e);
      expect(error).toBeInstanceOf(CommandRefused);
      expect(noTyping(t.log)).toEqual([]);
      expect(t.log).not.toContain('openApp com.tinyspeck.slackmacgap');
    });

    it('stops when a meeting app is in front after the app opened', async () => {
      const t = setup({ contexts: [safari, safari, zoom] });
      const error = await t.pipeline
        .deliver(say('message priya on slack saying hello'), 'command')
        .catch((e) => e);
      expect(error).toBeInstanceOf(CommandRefused);
      expect(noTyping(t.log)).toEqual([]);
    });

    it('stops when the cursor lands in a password field before the text is typed', async () => {
      const secure = context('com.tinyspeck.slackmacgap', { secureField: true });
      const t = setup({
        contexts: [],
        contextFor: (log) => (log.includes('insert Priya') ? secure : slackCtx),
      });
      const error = await t.pipeline
        .deliver(say('message priya on slack saying hello'), 'command')
        .catch((e) => e);
      expect(error).toBeInstanceOf(SafetyRefusal);
      expect(t.log.filter((l) => l.startsWith('insert I') || l.startsWith('chip'))).toEqual([]);
      expect(t.log.filter((l) => l === 'key enter').length).toBeLessThanOrEqual(1);
    });

    it('does not send when the app changed after the chip', async () => {
      const t = setup({
        contexts: [],
        contextFor: (log) => (log.some((l) => l.startsWith('chip ')) ? safari : slackCtx),
      });
      const error = await t.pipeline
        .deliver(say('message priya on slack saying hello'), 'command')
        .catch((e) => e);
      expect(error).toBeInstanceOf(CommandFailed);
      expect(t.log.filter((l) => l === 'key enter')).toHaveLength(1); // only the pick
    });

    it('does not send when a meeting app came to the front after the chip', async () => {
      const t = setup({
        contexts: [],
        contextFor: (log) => (log.some((l) => l.startsWith('chip ')) ? zoom : slackCtx),
      });
      const error = await t.pipeline
        .deliver(say('message priya on slack saying hello'), 'command')
        .catch((e) => e);
      expect(error).toBeInstanceOf(CommandRefused);
      expect(t.log.filter((l) => l === 'key enter')).toHaveLength(1);
    });
  });

  it('waits for a freshly opened app to be ready before using its search (fake timers)', async () => {
    vi.useFakeTimers();
    const t = setup({ contexts: [safari, safari, slackCtx], messageSpeed: 1 });
    const done = t.pipeline.deliver(say('message priya on slack saying hi'), 'command');
    await vi.advanceTimersByTimeAsync(1_799);
    expect(t.log).not.toContain('key cmd+k');
    await vi.advanceTimersByTimeAsync(1);
    expect(t.log).toContain('key cmd+k');
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
  });
});
