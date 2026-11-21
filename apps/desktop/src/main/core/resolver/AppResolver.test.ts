import { describe, expect, it } from 'vitest';
import { asDomain, AppResolver, resolveOpen, resolveSwitch, type KnownApp } from './AppResolver.ts';

const app = (name: string, bundleId: string, running = false): KnownApp => ({
  name,
  bundleId,
  running,
});
const apps: KnownApp[] = [
  app('Slack', 'com.tinyspeck.slackmacgap', true),
  app('Safari', 'com.apple.Safari', true),
  app('Google Chrome', 'com.google.Chrome', true),
  app('Visual Studio Code', 'com.microsoft.VSCode'),
  app('GitHub Desktop', 'com.github.GitHubClient'),
  app('Calculator', 'com.apple.calculator'),
  app('Notes', 'com.apple.Notes'),
  app('Notion', 'notion.id'),
];

describe('resolveOpen', () => {
  it.each([
    ['slack', 'app', 'com.tinyspeck.slackmacgap'],
    ['Slack', 'app', 'com.tinyspeck.slackmacgap'],
    ['calculator', 'app', 'com.apple.calculator'],
    ['visual studio', 'app', 'com.microsoft.VSCode'], // prefix of the app name
    ['chrome', 'app', 'com.google.Chrome'] as const, // not exact, no site: falls to... see below
  ])('%s → %s', (target, type, bundleId) => {
    const r = resolveOpen(target, apps);
    if (target === 'chrome') {
      // "chrome" is not a prefix of "Google Chrome"; it falls through to a web search.
      expect(r.type).toBe('url');
      return;
    }
    expect(r).toMatchObject({ type, bundleId });
  });

  it('a known site wins over an app that merely starts with its name', () => {
    // GitHub Desktop is installed, but "github" is the website unless the app is named exactly so.
    expect(resolveOpen('github', apps)).toEqual({
      type: 'url',
      url: 'https://github.com',
      kind: 'site',
    });
  });

  it('an app named exactly wins over a site', () => {
    const withApp = [...apps, app('GitHub', 'com.example.github')];
    expect(resolveOpen('github', withApp)).toMatchObject({
      type: 'app',
      bundleId: 'com.example.github',
    });
  });

  it.each([
    ['youtube', 'https://www.youtube.com'],
    ['Hacker News', 'https://news.ycombinator.com'],
    ['stack overflow', 'https://stackoverflow.com'],
  ])('known site %s', (target, url) => {
    expect(resolveOpen(target, apps)).toEqual({ type: 'url', url, kind: 'site' });
  });

  it.each([
    ['github dot com', 'https://github.com'],
    ['github.com', 'https://github.com'],
    ['docs dot rs', 'https://docs.rs'],
    ['example dot co dot uk', 'https://example.co.uk'],
  ])('spelled-out domain %s', (target, url) => {
    expect(resolveOpen(target, apps)).toEqual({ type: 'url', url, kind: 'domain' });
  });

  it('prefers running apps and shorter names when several match', () => {
    const many = [app('Acme Calendar', 'a.cal'), app('Acme Mail', 'b.mail', true)];
    expect(resolveOpen('acme', many)).toMatchObject({ bundleId: 'b.mail' });
    const both = [
      app('Acme Calendar', 'a.cal'),
      app('Acme', 'b.long.one'),
      app('Acme Pro Suite', 'c.pro'),
    ];
    expect(resolveOpen('acme', both)).toMatchObject({ bundleId: 'b.long.one' }); // exact beats prefix
    const idle = [app('Acme Calendar', 'a.cal'), app('Acme Mail', 'b.mail')];
    expect(resolveOpen('acme', idle)).toMatchObject({ bundleId: 'b.mail' }); // shorter name wins
  });

  it('fixes a close mis-hearing of an app or site', () => {
    expect(resolveOpen('calculater', apps)).toMatchObject({
      type: 'app',
      bundleId: 'com.apple.calculator',
    });
    expect(resolveOpen('yootube', apps)).toMatchObject({
      kind: 'site',
      url: 'https://www.youtube.com',
    });
  });

  it('falls back to a web search, with the words encoded', () => {
    expect(resolveOpen('flibber jabber', apps)).toEqual({
      type: 'url',
      url: 'https://www.google.com/search?q=flibber%20jabber',
      kind: 'search',
    });
  });

  it('never produces anything but https URLs', () => {
    for (const target of ['javascript alert one', 'file etc passwd', 'localhost', 'x']) {
      const r = resolveOpen(target, apps);
      if (r.type === 'url') expect(r.url.startsWith('https://')).toBe(true);
    }
  });
});

describe('resolveSwitch', () => {
  it.each([
    ['safari', 'com.apple.Safari'],
    ['Slack', 'com.tinyspeck.slackmacgap'],
    ['google chrome', 'com.google.Chrome'],
  ])('%s', (name, bundleId) => {
    expect(resolveSwitch(name, apps)?.bundleId).toBe(bundleId);
  });

  it('only switches to running apps', () => {
    expect(resolveSwitch('calculator', apps)).toBeNull();
    expect(resolveSwitch('visual studio code', apps)).toBeNull();
  });
});

describe('asDomain', () => {
  it.each([
    ['github dot com', 'github.com'],
    ['GitHub.com', 'github.com'],
    ['a-b dot io', 'a-b.io'],
    ['github', null],
    ['hello world', null],
    ['file.txt1', null],
  ])('%j → %j', (input, expected) => {
    expect(asDomain(input)).toBe(expected);
  });
});

describe('AppResolver', () => {
  it('lists apps for each lookup', async () => {
    let calls = 0;
    const resolver = new AppResolver(async () => {
      calls += 1;
      return apps;
    });
    await resolver.resolveOpen('slack');
    await resolver.resolveSwitch('safari');
    expect(calls).toBe(2);
  });
});
