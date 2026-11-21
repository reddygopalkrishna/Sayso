import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutMeForm } from './AboutMe.tsx';
import { Card } from './Card.tsx';
import { SpeedSummary } from './History.tsx';
import { AppStyleList, SettingsForm } from './Settings.tsx';
import { PROFILE_FIELDS } from '../../shared/profile.ts';

const html = (node: React.JSX.Element): string => renderToStaticMarkup(node);
const noop = () => undefined;

describe('Card', () => {
  it('names the region after its title and shows the description', () => {
    const out = html(
      <Card title="Voice" description="How you talk">
        body
      </Card>,
    );
    expect(out).toContain('aria-label="Voice"');
    expect(out).toContain('How you talk');
    expect(out).toContain('rounded-xl');
  });

  it('uses label for the accessible name when given', () => {
    expect(html(<Card label="Speed">x</Card>)).toContain('aria-label="Speed"');
  });
});

describe('Settings grouped into cards', () => {
  const out = html(
    <SettingsForm
      values={{
        pauseMs: 600,
        previewMs: 1000,
        cleanupLevel: 'full',
        skipAi: true,
        historyKeep: 50,
        style: 'default',
        holdKey: 'fn',
        wakeWord: 'sayso',
        language: 'en',
        interpret: true,
        cloudSpeech: false,
      }}
      message={null}
      saved={false}
      onChange={noop}
      onSave={noop}
      onReset={noop}
    />,
  );
  const position = (text: string): number => out.indexOf(text);
  const cards = ['Voice', 'Text', 'Understanding', 'Privacy and history'];

  it('has the four cards, in order', () => {
    const at = cards.map((c) => position(`aria-label="${c}"`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it.each([
    ['Voice', 'Key to hold to dictate'],
    ['Voice', 'Language you speak'],
    ['Voice', 'Hands-free wake word'],
    ['Text', 'Text cleanup'],
    ['Text', 'Style'],
    ['Text', 'Skip the AI for short, clean text'],
    ['Text', 'Pause before'],
    ['Understanding', 'Understand my own words'],
    ['Privacy and history', 'History kept'],
  ])('the %s card contains "%s"', (card, setting) => {
    const next = cards[cards.indexOf(card) + 1];
    const start = position(`aria-label="${card}"`);
    const end = next ? position(`aria-label="${next}"`) : out.length;
    const at = out.indexOf(setting, start);
    expect(at).toBeGreaterThan(start);
    expect(at).toBeLessThan(end);
  });

  it('keeps Save and Reset', () => {
    expect(out).toContain('Save');
    expect(out).toContain('Reset to defaults');
  });
});

describe('Style per app card', () => {
  it('is a card with its own name', () => {
    const out = html(<AppStyleList apps={[]} everywhere="chill" onChange={noop} />);
    expect(out).toContain('aria-label="Style per app"');
    expect(out).toContain('(Chill)');
    expect(out).toContain('No apps yet.');
  });
});

describe('About me card', () => {
  it('puts every field in one card and keeps Save', () => {
    const values = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, ''])) as Parameters<
      typeof AboutMeForm
    >[0]['values'];
    const out = html(
      <AboutMeForm values={values} message={null} saved={false} onChange={noop} onSave={noop} />,
    );
    expect(out).toContain('aria-label="Your details"');
    for (const f of PROFILE_FIELDS) expect(out).toContain(f.label);
    expect(out).toContain('never sent anywhere');
  });
});

describe('Activity speed card', () => {
  it('is a card', () => {
    const stats = {
      dictations: 5,
      medianMs: 900,
      p95Ms: 1500,
      withCleanup: 5,
      share: { local: 0.6, llm: 0.4 },
      aiMedianMs: 1200,
      byProvider: [],
    } as unknown as Parameters<typeof SpeedSummary>[0]['stats'];
    expect(html(<SpeedSummary stats={stats} />)).toContain('rounded-xl');
  });
});
