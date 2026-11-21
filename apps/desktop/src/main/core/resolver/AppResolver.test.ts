import { describe, expect, it } from 'vitest';
import {
  asDomain,
  AppResolver,
  parseOpenTarget,
  resolveOpen,
  resolveSwitch,
  type KnownApp,
  type ResolverMemory,
} from './AppResolver.ts';

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
    ['chrome', 'app', 'com.google.Chrome'], // a word inside the app name (open Chrome)
    ['code', 'app', 'com.microsoft.VSCode'],
    ['studio code', 'app', 'com.microsoft.VSCode'],
  ])('%s → %s', (target, type, bundleId) => {
    expect(resolveOpen(target, apps)).toMatchObject({ type, bundleId });
  });

  it('a word match must be a whole word: chro is not Chrome', () => {
    expect(resolveOpen('chro', apps)).toMatchObject({ type: 'url', kind: 'search' });
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
    ['chrome', 'com.google.Chrome'],
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

describe('parseOpenTarget', () => {
  it.each([
    ['github', 'github', null],
    ['GitHub app', 'github', 'app'],
    ['the github application', 'the github', 'app'],
    ['github website', 'github', 'site'],
    ['github web site', 'github', 'site'],
    ['hacker news page', 'hacker news', 'site'],
    ['github dot com', 'github dot com', null],
  ])('%j', (target, name, prefer) => {
    expect(parseOpenTarget(target)).toEqual({ name, prefer });
  });
});

describe('resolveOpen with a stated preference', () => {
  it('app: picks the app even though a known site has the same name', () => {
    expect(resolveOpen('github', apps, 'app')).toMatchObject({
      type: 'app',
      bundleId: 'com.github.GitHubClient',
    });
  });
  it('site: picks the website even though an app has the same name', () => {
    const withApp = [...apps, app('GitHub', 'com.example.github')];
    expect(resolveOpen('github', withApp, 'site')).toMatchObject({ type: 'url', kind: 'site' });
  });
  it('falls back to the normal order when the preferred kind does not exist', () => {
    expect(resolveOpen('youtube', apps, 'app')).toMatchObject({ type: 'url', kind: 'site' });
    expect(resolveOpen('calculator', apps, 'site')).toMatchObject({
      type: 'app',
      bundleId: 'com.apple.calculator',
    });
  });
});

describe('AppResolver with remembered choices', () => {
  function setup(installed: KnownApp[] = apps) {
    const store = new Map<string, { targetType: 'app' | 'url'; target: string }>();
    const memory: ResolverMemory = {
      get: (p) => store.get(p) ?? null,
      set: (p, targetType, target) => void store.set(p, { targetType, target }),
    };
    return { resolver: new AppResolver(async () => installed, memory), store };
  }

  it('"open GitHub app" opens the app and teaches "open GitHub"', async () => {
    const { resolver, store } = setup();
    expect(await resolver.resolveOpen('github')).toMatchObject({ type: 'url', kind: 'site' }); // default
    expect(await resolver.resolveOpen('GitHub app')).toMatchObject({
      type: 'app',
      bundleId: 'com.github.GitHubClient',
    });
    expect(store.get('github')).toEqual({ targetType: 'app', target: 'com.github.GitHubClient' });
    expect(await resolver.resolveOpen('github')).toMatchObject({
      type: 'app',
      bundleId: 'com.github.GitHubClient',
    });
  });

  it('"open GitHub website" teaches the other way round', async () => {
    const { resolver, store } = setup([...apps, app('GitHub', 'com.example.github')]);
    expect(await resolver.resolveOpen('github')).toMatchObject({ type: 'app' }); // exact app name wins
    await resolver.resolveOpen('github website');
    expect(store.get('github')).toEqual({ targetType: 'url', target: 'https://github.com' });
    expect(await resolver.resolveOpen('github')).toEqual({
      type: 'url',
      url: 'https://github.com',
      kind: 'site',
    });
  });

  it('does not remember a preference that could not be satisfied', async () => {
    const { resolver, store } = setup();
    await resolver.resolveOpen('flibber app'); // no such app: becomes a web search
    expect(store.size).toBe(0);
  });

  it('forgets an app that is no longer installed and falls back to the normal search', async () => {
    const { resolver, store } = setup([app('Calculator', 'com.apple.calculator')]);
    store.set('github', { targetType: 'app', target: 'com.github.GitHubClient' });
    expect(await resolver.resolveOpen('github')).toMatchObject({ type: 'url', kind: 'site' });
  });

  it('never opens a remembered link that is not http(s)', async () => {
    const { resolver, store } = setup();
    store.set('evil', { targetType: 'url', target: 'file:///etc/passwd' });
    const r = await resolver.resolveOpen('evil');
    expect(r).toMatchObject({ type: 'url', kind: 'search' });
  });

  it('works without a database', async () => {
    const resolver = new AppResolver(async () => apps);
    expect(await resolver.resolveOpen('github app')).toMatchObject({ type: 'app' });
  });
});
