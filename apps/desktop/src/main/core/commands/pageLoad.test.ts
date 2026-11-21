import { describe, expect, it } from 'vitest';
import { isBrowser, loadsPage, type StepEffect } from './pageLoad.ts';

const CHROME = 'com.google.Chrome';
const SLACK = 'com.tinyspeck.slackmacgap';

describe('loadsPage', () => {
  it.each<[string, StepEffect, string | null, boolean]>([
    ['enter in Chrome', { type: 'keyPress', key: 'enter' }, CHROME, true],
    [
      'enter with no modifiers list',
      { type: 'keyPress', key: 'enter', modifiers: [] },
      CHROME,
      true,
    ],
    [
      'shift+enter (new line)',
      { type: 'keyPress', key: 'enter', modifiers: ['shift'] },
      CHROME,
      false,
    ],
    ['enter in Slack', { type: 'keyPress', key: 'enter' }, SLACK, false],
    [
      'cmd+t (new tab) in Chrome',
      { type: 'keyPress', key: 't', modifiers: ['cmd'] },
      CHROME,
      false,
    ],
    ['send in Chrome', { type: 'contextual_send' }, CHROME, true],
    ['send in Slack', { type: 'contextual_send' }, SLACK, false],
    ['click in Chrome', { type: 'pressElement' }, CHROME, true],
    ['click in Finder', { type: 'pressElement' }, 'com.apple.finder', false],
    ['open the Nth in Safari', { type: 'pressPosition' }, 'com.apple.Safari', true],
    ['open a website, from any app', { type: 'openTarget', resolved: 'url' }, SLACK, true],
    ['open an app', { type: 'openTarget', resolved: 'app' }, CHROME, false],
    ['anything else', { type: 'other' }, CHROME, false],
    ['click with no app known', { type: 'pressElement' }, null, false],
  ])('%s', (_name, effect, bundleId, expected) => {
    expect(loadsPage(effect, bundleId)).toBe(expected);
  });
});

describe('isBrowser', () => {
  it.each([
    [CHROME, true],
    ['com.apple.Safari', true],
    ['org.mozilla.firefox', true],
    ['company.thebrowser.Browser', true],
    [SLACK, false],
    [null, false],
  ])('%s → %s', (id, expected) => expect(isBrowser(id)).toBe(expected));
});
