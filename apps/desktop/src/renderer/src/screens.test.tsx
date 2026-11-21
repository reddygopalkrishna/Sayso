import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../shared/data.ts';
import type { PermissionsStatus } from '../../shared/status.ts';
import { cleanupLabel, HistoryRow, SpeedSummary } from './History.tsx';
import type { HistoryStats } from './historyStats.ts';
import { Onboarding } from './Onboarding.tsx';
import { AppStyleList, SettingsForm } from './Settings.tsx';

const html = (node: React.JSX.Element): string => renderToStaticMarkup(node);

describe('Onboarding', () => {
  const show = (
    microphone: PermissionsStatus['microphone'],
    accessibility: PermissionsStatus['accessibility'],
  ) => html(<Onboarding permissions={{ microphone, accessibility }} />);

  it.each([
    ['everything granted', 'granted', 'granted'],
    ['still asking the helper', 'unknown', 'unknown'],
    ['one answer missing', 'granted', 'unknown'],
  ] as const)('shows nothing when %s', (_label, mic, ax) => {
    expect(show(mic, ax)).toBe('');
  });

  it('asks for the microphone when macOS has not been asked yet', () => {
    const out = show('undetermined', 'granted');
    expect(out).toContain('Allow microphone');
    expect(out).not.toContain('Open Microphone settings');
    expect(out).toContain('Microphone, so Sayso can hear you');
  });

  it.each(['denied', 'restricted'] as const)(
    'points to System Settings when the microphone is %s',
    (mic) => {
      const out = show(mic, 'granted');
      expect(out).toContain('Open Microphone settings');
      expect(out).not.toContain('Allow microphone');
    },
  );

  it('explains Accessibility with both a prompt and the settings pane', () => {
    const out = show('granted', 'denied');
    expect(out).toContain('Show the macOS prompt');
    expect(out).toContain('Open Accessibility settings');
  });

  it('marks finished steps done and hides their buttons', () => {
    const out = show('granted', 'denied');
    expect(out).toContain('Microphone, so Sayso can hear you');
    expect(out).toContain('(done)');
    expect(out).not.toContain('Allow microphone');
  });

  it('is announced to screen readers as a region', () => {
    expect(show('denied', 'denied')).toContain('aria-label="Set up permissions"');
  });
});

describe('HistoryRow', () => {
  const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
    id: 'e1',
    createdAt: 1_700_000_000_000,
    appBundleId: 'com.tinyspeck.slackmacgap',
    appName: 'Slack',
    mode: 'dictation',
    rawText: 'um hello there',
    finalText: 'Hello there.',
    action: null,
    outcome: 'done',
    latencyMs: 1500,
    cleanup: null,
    ...over,
  });

  it('shows what was heard, what was typed, the app, the time and the outcome', () => {
    const out = html(<HistoryRow entry={entry()} />);
    expect(out).toContain('“um hello there”');
    expect(out).toContain('Hello there.');
    expect(out).toContain('Slack');
    expect(out).toContain('1.5 s');
    expect(out).toContain('Done');
    expect(out).toContain('Dictation');
  });

  it('never shows text that was not saved (password field), and says why', () => {
    const out = html(
      <HistoryRow entry={entry({ rawText: null, finalText: null, outcome: 'blocked' })} />,
    );
    expect(out).toContain('Not saved: it was said into a password field.');
    expect(out).toContain('Blocked');
    expect(out).not.toContain('Heard');
  });

  it('shows a command and its result', () => {
    const out = html(
      <HistoryRow
        entry={entry({
          mode: 'command',
          rawText: 'Click Submit.',
          finalText: null,
          action: { command: 'click', result: 'cancelled' },
          outcome: 'cancelled',
        })}
      />,
    );
    expect(out).toContain('Command');
    expect(out).toContain('Cancelled “click”');
  });

  it('keeps the line breaks of a typed list readable', () => {
    const out = html(
      <HistoryRow entry={entry({ finalText: '1. First thing.\n2. Second thing.' })} />,
    );
    expect(out).toContain('whitespace-pre-line');
    expect(out).toContain('1. First thing.\n2. Second thing.');
  });

  it('turns underscores in command names into spaces', () => {
    const out = html(
      <HistoryRow
        entry={entry({ finalText: null, action: { command: 'new_line', result: 'ran' } })}
      />,
    );
    expect(out).toContain('Ran “new line”');
  });

  it('escapes text that looks like HTML', () => {
    const out = html(
      <HistoryRow
        entry={entry({ rawText: '<img src=x onerror=alert(1)>', finalText: '<b>x</b>' })}
      />,
    );
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>x</b>');
    expect(out).toContain('&lt;img');
  });

  it('copes with an unknown app and latency', () => {
    const out = html(<HistoryRow entry={entry({ appName: null, latencyMs: null })} />);
    expect(out).toContain('Dictation');
    expect(out).not.toContain(' s</span>');
  });
});

describe('how each row was cleaned up', () => {
  const entry = (cleanup: HistoryEntry['cleanup']): HistoryEntry => ({
    id: 'e',
    createdAt: 1_700_000_000_000,
    appBundleId: null,
    appName: null,
    mode: 'dictation',
    rawText: 'a',
    finalText: 'A.',
    action: null,
    outcome: 'done',
    latencyMs: 900,
    cleanup,
  });

  it.each([
    [{ method: 'llm', ms: 940 }, 'AI 0.9 s'],
    [{ method: 'llm', ms: 240, provider: 'groq' }, 'Groq 0.2 s'],
    [{ method: 'llm', ms: 910, provider: 'gemini' }, 'Gemini 0.9 s'],
    [{ method: 'local', ms: 1 }, 'no AI needed'],
    [{ method: 'fallback', ms: 2500 }, 'AI unavailable, local rules'],
    [{ method: 'light', ms: 1 }, 'local rules'],
    [{ method: 'off', ms: 0 }, 'raw'],
  ] as const)('%o → %s', (cleanup, label) => {
    expect(cleanupLabel(cleanup)).toBe(label);
    expect(renderToStaticMarkup(<HistoryRow entry={entry(cleanup)} />)).toContain(label);
  });

  it('shows nothing for rows saved before cleanup was recorded', () => {
    const out = renderToStaticMarkup(<HistoryRow entry={entry(null)} />);
    expect(out).not.toContain('no AI needed');
    expect(out).not.toContain('AI ');
  });
});

describe('SpeedSummary', () => {
  const stats = (over: Partial<HistoryStats> = {}): HistoryStats => ({
    dictations: 10,
    medianMs: 1100,
    p95Ms: 2400,
    aiMedianMs: 900,
    byProvider: [
      { provider: 'groq', count: 8, medianMs: 240 },
      { provider: 'gemini', count: 2, medianMs: 910 },
    ],
    share: { llm: 0.6, local: 0.3, fallback: 0.1 },
    withCleanup: 10,
    ...over,
  });

  it('shows the median, the slowest 5% and how often the AI was skipped', () => {
    const out = renderToStaticMarkup(<SpeedSummary stats={stats()} />);
    expect(out).toContain('last 10 dictations');
    expect(out).toContain('median 1.1 s');
    expect(out).toContain('slowest 5% 2.4 s');
    expect(out).toContain('AI skipped 30%');
    expect(out).toContain('AI used 60%');
    expect(out).toContain('median 0.9 s');
    expect(out).toContain('AI unavailable 10%');
    expect(out).toContain('Groq 0.2 s (8), Gemini 0.9 s (2)');
  });

  it('stays quiet until there are a few dictations to talk about', () => {
    expect(renderToStaticMarkup(<SpeedSummary stats={stats({ dictations: 2 })} />)).toBe('');
    expect(renderToStaticMarkup(<SpeedSummary stats={stats({ medianMs: null })} />)).toBe('');
  });

  it('leaves out the AI line when old rows did not record it', () => {
    const out = renderToStaticMarkup(
      <SpeedSummary stats={stats({ withCleanup: 1, share: { llm: 1 } })} />,
    );
    expect(out).toContain('median 1.1 s');
    expect(out).not.toContain('AI skipped');
  });
});

describe('SettingsForm', () => {
  const values = {
    pauseMs: 600,
    previewMs: 1000,
    cleanupLevel: 'full',
    skipAi: true,
    historyKeep: 50,
    style: 'default',
    holdKey: 'fn',
  } as const;
  const noop = () => undefined;
  const show = (over: Partial<Parameters<typeof SettingsForm>[0]> = {}) =>
    html(
      <SettingsForm
        values={values}
        message={null}
        saved={false}
        onChange={noop}
        onSave={noop}
        onReset={noop}
        {...over}
      />,
    );

  it('shows every setting in plain words with its current value', () => {
    const out = show();
    expect(out).toContain('Pause before “send”');
    expect(out).toContain('0.6 s');
    expect(out).toContain('1.0 s');
    expect(out).toContain('Text cleanup');
    expect(out).toContain('Skip the AI for short, clean text');
    expect(out).toContain('History kept');
    expect(out).toContain('value="50"');
    expect(out).toContain('Reset to defaults');
  });

  it('uses the same limits as the app (sliders and number box)', () => {
    const out = show();
    expect(out).toContain('min="200"');
    expect(out).toContain('max="3000"');
    expect(out).toContain('max="5000"');
    expect(out).toContain('max="1000"');
  });

  it('says "Saved." after a save and shows an error instead when there is one', () => {
    expect(show({ saved: true })).toContain('Saved.');
    const failed = show({ saved: true, message: 'That request was not valid.' });
    expect(failed).toContain('That request was not valid.');
    expect(failed).not.toContain('Saved.');
  });
});

describe('Style in Settings', () => {
  const noop = () => undefined;
  const form = (style: 'default' | 'chill') =>
    html(
      <SettingsForm
        values={{
          pauseMs: 600,
          previewMs: 1000,
          cleanupLevel: 'full',
          skipAi: true,
          historyKeep: 50,
          style,
          holdKey: 'fn',
        }}
        message={null}
        saved={false}
        onChange={noop}
        onSave={noop}
        onReset={noop}
      />,
    );

  it('offers Default and Chill with an example of each', () => {
    const out = form('default');
    expect(out).toContain('Capitals and full punctuation');
    expect(out).toContain('No capitals, minimal punctuation');
    expect(out).toContain('Hey, are you free for lunch tomorrow?');
    expect(out).toContain('hey are you free for lunch tomorrow');
  });

  it('marks the chosen style', () => {
    expect(form('chill').match(/checked=""/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('lists the apps with their style and the everywhere choice', () => {
    const out = html(
      <AppStyleList
        everywhere="chill"
        onChange={noop}
        apps={[
          { bundleId: 'com.tinyspeck.slackmacgap', appName: 'Slack', style: 'default' },
          { bundleId: 'com.apple.Notes', appName: 'Notes', style: null },
        ]}
      />,
    );
    expect(out).toContain('Style for Slack');
    expect(out).toContain('Style for Notes');
    expect(out).toContain('Chill');
    expect(out).toContain('<option value="everywhere" selected="">Everywhere</option>');
  });

  it('says so when there are no apps yet', () => {
    expect(html(<AppStyleList everywhere="default" onChange={noop} apps={[]} />)).toContain(
      'No apps yet.',
    );
  });
});

describe('Hold key in Settings', () => {
  const noop = () => undefined;
  const form = (holdKey: 'fn' | 'rightOption' | 'rightCommand' | 'rightControl') =>
    html(
      <SettingsForm
        values={{
          pauseMs: 600,
          previewMs: 1000,
          cleanupLevel: 'full',
          skipAi: true,
          historyKeep: 50,
          style: 'default',
          holdKey,
        }}
        message={null}
        saved={false}
        onChange={noop}
        onSave={noop}
        onReset={noop}
      />,
    );

  it('offers Fn and the three right-hand keys, and explains why you would change it', () => {
    const out = form('fn');
    for (const text of ['Fn (globe key)', 'Right Option', 'Right Command', 'Right Control']) {
      expect(out).toContain(text);
    }
    expect(out).toContain('another dictation app already uses Fn');
  });

  it('shows the chosen key as selected', () => {
    expect(form('rightOption')).toContain('<option value="rightOption" selected="">');
  });
});
