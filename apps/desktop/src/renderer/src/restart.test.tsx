import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasCurrentApi, RestartNeeded } from './RestartNeeded.tsx';

const current = {
  getStatus: () => undefined,
  onStatus: () => undefined,
  history: {},
  dictionary: {},
  snippets: {},
  settings: {},
  appStyles: {},
  handsFree: {},
  openChoices: {},
  permissions: {},
};

describe('hasCurrentApi', () => {
  it('accepts the full API', () => {
    expect(hasCurrentApi(current)).toBe(true);
  });

  it('rejects the API of an older app (only status, as before step 7)', () => {
    expect(hasCurrentApi({ getStatus: () => undefined, onStatus: () => undefined })).toBe(false);
  });

  it.each([
    ['missing history', { ...current, history: undefined }],
    ['missing permissions', { ...current, permissions: undefined }],
    ['missing snippets (an app from before snippets)', { ...current, snippets: undefined }],
    ['a section that is not an object', { ...current, dictionary: 'x' }],
    ['null section', { ...current, openChoices: null }],
  ])('rejects %s', (_label, api) => {
    expect(hasCurrentApi(api)).toBe(false);
  });

  it.each([undefined, null, 'sayso', 5])('rejects %j', (api) => {
    expect(hasCurrentApi(api)).toBe(false);
  });
});

describe('RestartNeeded', () => {
  it('tells you what to do, as an alert', () => {
    const out = renderToStaticMarkup(<RestartNeeded />);
    expect(out).toContain('Restart Sayso');
    expect(out).toContain('pnpm dev');
    expect(out).toContain('role="alert"');
  });
});
