import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../shared/data.ts';
import type { PermissionsStatus } from '../../shared/status.ts';
import { cleanupLabel, HistoryRow, SpeedSummary } from './History.tsx';
import type { HistoryStats } from './historyStats.ts';
import { Onboarding } from './Onboarding.tsx';

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
