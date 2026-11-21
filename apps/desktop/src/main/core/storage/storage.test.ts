import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { DictionaryError, DictionaryRepo, MAX_ENTRIES } from './DictionaryRepo.ts';
import { HistoryRepo, type NewHistoryEntry } from './HistoryRepo.ts';
import { MIGRATIONS, migrate, schemaVersion } from './migrations.ts';
import { memoryKey, ResolverMemoryRepo } from './ResolverMemoryRepo.ts';
import { SettingsRepo } from './SettingsRepo.ts';
import { MAX_SNIPPETS, normalizeTrigger, SnippetError, SnippetRepo } from './SnippetRepo.ts';
import { openStorage } from './index.ts';

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'sayso-db-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const memoryDb = () => {
  const db = openDb(':memory:');
  migrate(db);
  return db;
};

const entry = (over: Partial<NewHistoryEntry> = {}): NewHistoryEntry => ({
  appBundleId: 'com.tinyspeck.slackmacgap',
  appName: 'Slack',
  mode: 'dictation',
  rawText: 'um hello there',
  finalText: 'Hello there.',
  action: null,
  outcome: 'done',
  latencyMs: 900,
  cleanup: null,
  ...over,
});

describe('migrations', () => {
  it('creates the schema and records the version', () => {
    const db = openDb(':memory:');
    expect(schemaVersion(db)).toBe(0);
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((t) => t.name);
    expect(tables).toEqual([
      'dictionary_entry',
      'resolver_memory',
      'setting',
      'snippet',
      'utterance_history',
    ]);
  });

  it('is safe to run twice', () => {
    const db = memoryDb();
    expect(() => migrate(db)).not.toThrow();
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  it('applies only the steps that are missing, each atomically', () => {
    const db = openDb(':memory:');
    migrate(db, ['CREATE TABLE a (x INTEGER);']);
    expect(schemaVersion(db)).toBe(1);
    // The second step fails half way: nothing of it may remain, and the version stays at 1.
    expect(() =>
      migrate(db, [
        'CREATE TABLE a (x INTEGER);',
        'CREATE TABLE b (x INTEGER); CREATE TABLE a (y);',
      ]),
    ).toThrow();
    expect(schemaVersion(db)).toBe(1);
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'b'")).toBeUndefined();
  });

  it('refuses a database written by a newer app', () => {
    const db = openDb(':memory:');
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer than this app/);
  });

  it('enforces the allowed values', () => {
    const db = memoryDb();
    expect(() =>
      db.run(
        `INSERT INTO utterance_history (id, created_at, mode, outcome) VALUES ('1', 1, 'shout', 'done')`,
      ),
    ).toThrow();
    expect(() =>
      db.run(
        `INSERT INTO utterance_history (id, created_at, mode, outcome) VALUES ('1', 1, 'dictation', 'maybe')`,
      ),
    ).toThrow();
  });
});

describe('db', () => {
  it('rolls back a failed transaction and lets a nested one join', () => {
    const db = memoryDb();
    expect(() =>
      db.transaction(() => {
        db.run(
          `INSERT INTO resolver_memory (phrase, target_type, target, updated_at) VALUES ('a', 'app', 'x', 1)`,
        );
        db.transaction(() =>
          db.run(
            `INSERT INTO resolver_memory (phrase, target_type, target, updated_at) VALUES ('b', 'app', 'y', 1)`,
          ),
        );
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.all('SELECT * FROM resolver_memory')).toEqual([]);
    // The connection is usable afterwards.
    db.transaction(() =>
      db.run(
        `INSERT INTO resolver_memory (phrase, target_type, target, updated_at) VALUES ('c', 'app', 'z', 1)`,
      ),
    );
    expect(db.all('SELECT * FROM resolver_memory')).toHaveLength(1);
  });

  it('uses parameters, so quotes in text are data, not SQL', () => {
    const db = memoryDb();
    const history = new HistoryRepo(db, { keep: () => 50 });
    history.record(entry({ rawText: "Robert'); DROP TABLE utterance_history;--" }));
    expect(history.recent()[0]?.rawText).toBe("Robert'); DROP TABLE utterance_history;--");
    expect(history.count()).toBe(1);
  });

  it('creates a private file and keeps the data across reopening', () => {
    const path = join(tempDir(), 'nested', 'sayso.sqlite');
    const first = openStorage(path, { historyKeep: () => 50 });
    first.history.record(entry());
    first.dictionary.upsert('Sayso');
    first.close();

    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);

    const second = openStorage(path, { historyKeep: () => 50 });
    expect(second.history.recent().map((h) => h.finalText)).toEqual(['Hello there.']);
    expect(second.dictionary.list().map((d) => d.phrase)).toEqual(['Sayso']);
    second.close();
  });
});

describe('schema upgrade 1 → 2 (how each dictation was cleaned up)', () => {
  it('keeps the rows saved before the upgrade, with no cleanup info', () => {
    const db = openDb(':memory:');
    migrate(db, MIGRATIONS.slice(0, 1));
    expect(schemaVersion(db)).toBe(1);
    db.run(
      `INSERT INTO utterance_history (id, created_at, mode, raw_text, final_text, outcome, latency_ms)
       VALUES ('old', 5, 'dictation', 'um hi', 'Hi.', 'done', 1200)`,
    );
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    const history = new HistoryRepo(db, { keep: () => 50 });
    expect(history.recent()).toMatchObject([
      { id: 'old', finalText: 'Hi.', latencyMs: 1200, cleanup: null },
    ]);
  });
});

describe('schema upgrade 2 → 3 (which AI answered)', () => {
  it('keeps rows saved before, with their cleanup info and no provider', () => {
    const db = openDb(':memory:');
    migrate(db, MIGRATIONS.slice(0, 2));
    expect(schemaVersion(db)).toBe(2);
    db.run(
      `INSERT INTO utterance_history (id, created_at, mode, raw_text, final_text, outcome, latency_ms, cleanup_method, cleanup_ms)
       VALUES ('v2', 5, 'dictation', 'um hi', 'Hi.', 'done', 1200, 'llm', 900)`,
    );
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(new HistoryRepo(db, { keep: () => 50 }).recent()).toMatchObject([
      { id: 'v2', cleanup: { method: 'llm', ms: 900 } },
    ]);
    expect(new HistoryRepo(db, { keep: () => 50 }).recent()[0]?.cleanup).not.toHaveProperty(
      'provider',
    );
  });
});

describe('schema upgrade 3 → 4 (snippets)', () => {
  it('adds the snippet table and keeps the dictionary and history as they were', () => {
    const db = openDb(':memory:');
    migrate(db, MIGRATIONS.slice(0, 3));
    expect(schemaVersion(db)).toBe(3);
    new DictionaryRepo(db).upsert('Sayso', 'say so');
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(new DictionaryRepo(db).list().map((d) => d.phrase)).toEqual(['Sayso']);
    expect(new SnippetRepo(db).list()).toEqual([]);
  });
});

describe('HistoryRepo', () => {
  it('returns newest first, with the action decoded', () => {
    let t = 1000;
    const history = new HistoryRepo(memoryDb(), { keep: () => 50, now: () => t++ });
    history.record(entry({ rawText: 'first' }));
    history.record(
      entry({
        mode: 'command',
        rawText: 'click submit',
        finalText: null,
        action: { command: 'click', result: 'ran', args: { label: 'submit' } },
      }),
    );
    const [newest, oldest] = history.recent();
    expect(newest).toMatchObject({
      mode: 'command',
      finalText: null,
      action: { command: 'click', result: 'ran', args: { label: 'submit' } },
    });
    expect(oldest?.rawText).toBe('first');
  });

  it('keeps only the last N rows (50 by default in the app)', () => {
    let t = 0;
    const history = new HistoryRepo(memoryDb(), { keep: () => 3, now: () => t++ });
    for (let i = 1; i <= 7; i++) history.record(entry({ rawText: `utterance ${i}` }));
    expect(history.count()).toBe(3);
    expect(history.recent().map((h) => h.rawText)).toEqual([
      'utterance 7',
      'utterance 6',
      'utterance 5',
    ]);
  });

  it('prunes by the current limit, so lowering it takes effect on the next write', () => {
    let keep = 10;
    let t = 0;
    const history = new HistoryRepo(memoryDb(), { keep: () => keep, now: () => t++ });
    for (let i = 0; i < 6; i++) history.record(entry());
    keep = 2;
    history.record(entry());
    expect(history.count()).toBe(2);
  });

  it('stores nothing when the limit is 0 (history off)', () => {
    const history = new HistoryRepo(memoryDb(), { keep: () => 0 });
    expect(history.record(entry())).toBeNull();
    expect(history.count()).toBe(0);
  });

  it('keeps rows written in the same millisecond in order', () => {
    const history = new HistoryRepo(memoryDb(), { keep: () => 50, now: () => 5 });
    history.record(entry({ rawText: 'a' }));
    history.record(entry({ rawText: 'b' }));
    expect(history.recent().map((h) => h.rawText)).toEqual(['b', 'a']);
  });

  it('stores how the text was cleaned up and how long that took', () => {
    let t = 0;
    const history = new HistoryRepo(memoryDb(), { keep: () => 50, now: () => t++ });
    history.record(entry({ cleanup: { method: 'llm', ms: 912.6 } }));
    history.record(entry({ cleanup: { method: 'local', ms: 2 } }));
    history.record(entry({ cleanup: null }));
    expect(history.recent().map((h) => h.cleanup)).toEqual([
      null,
      { method: 'local', ms: 2 },
      { method: 'llm', ms: 913 },
    ]);
  });

  it('stores which AI answered, and leaves it out when unknown', () => {
    let t = 0;
    const history = new HistoryRepo(memoryDb(), { keep: () => 50, now: () => t++ });
    history.record(entry({ cleanup: { method: 'llm', ms: 240, provider: 'groq' } }));
    history.record(entry({ cleanup: { method: 'llm', ms: 900 } }));
    const [newest, oldest] = history.recent();
    expect(oldest?.cleanup).toEqual({ method: 'llm', ms: 240, provider: 'groq' });
    expect(newest?.cleanup).toEqual({ method: 'llm', ms: 900 });
  });

  it('can be cleared at any time', () => {
    const history = new HistoryRepo(memoryDb(), { keep: () => 50 });
    history.record(entry());
    history.clear();
    expect(history.recent()).toEqual([]);
  });

  it('stores a null text (refused in a password field) as null', () => {
    const history = new HistoryRepo(memoryDb(), { keep: () => 50 });
    history.record(entry({ rawText: null, finalText: null, outcome: 'blocked' }));
    expect(history.recent()[0]).toMatchObject({
      rawText: null,
      finalText: null,
      outcome: 'blocked',
    });
  });
});

describe('DictionaryRepo', () => {
  const repo = () => new DictionaryRepo(memoryDb());

  it('adds, lists alphabetically ignoring case, and removes', () => {
    const dictionary = repo();
    dictionary.upsert('zebra');
    const kairo = dictionary.upsert('Kairo', 'kai row');
    dictionary.upsert('Anthropic');
    expect(dictionary.list().map((d) => d.phrase)).toEqual(['Anthropic', 'Kairo', 'zebra']);
    expect(kairo.spokenAs).toBe('kai row');
    expect(dictionary.remove(kairo.id)).toBe(true);
    expect(dictionary.remove(kairo.id)).toBe(false);
    expect(dictionary.count()).toBe(2);
  });

  it('adding the same word again (any case) updates it instead of duplicating', () => {
    const dictionary = repo();
    const first = dictionary.upsert('github');
    const again = dictionary.upsert('GitHub', 'get hub');
    expect(again.id).toBe(first.id);
    expect(dictionary.list()).toHaveLength(1);
    expect(dictionary.list()[0]).toMatchObject({ phrase: 'GitHub', spokenAs: 'get hub' });
  });

  it.each([
    ['', null, 'Type the word'],
    ['   ', null, 'Type the word'],
    ['x'.repeat(101), null, 'longer than 100'],
    ['Sayso', 'sayso', 'same as the word'],
    ['bad\u0000word', null, 'invalid characters'],
    ['ok', 'y'.repeat(101), 'longer than 100'],
  ])('rejects %j / %j', (phrase, heard, message) => {
    expect(() => repo().upsert(phrase, heard)).toThrow(DictionaryError);
    expect(() => repo().upsert(phrase, heard)).toThrow(message);
  });

  it('tidies whitespace', () => {
    expect(repo().upsert('  Visual   Studio  Code ').phrase).toBe('Visual Studio Code');
  });

  it('is limited in size', () => {
    const dictionary = repo();
    for (let i = 0; i < MAX_ENTRIES; i++) dictionary.upsert(`term${i}`);
    expect(() => dictionary.upsert('one more')).toThrow(/full/);
    // Updating an existing one still works when full.
    expect(() => dictionary.upsert('term1', 'turn one')).not.toThrow();
  });
});

describe('ResolverMemoryRepo', () => {
  it('remembers per phrase, ignoring case and punctuation, and overwrites', () => {
    let t = 1;
    const memory = new ResolverMemoryRepo(memoryDb(), () => t++);
    memory.set('GitHub', 'app', 'com.github.GitHubClient');
    expect(memory.get('github.')).toMatchObject({
      targetType: 'app',
      target: 'com.github.GitHubClient',
    });
    memory.set('github', 'url', 'https://github.com');
    expect(memory.get('GITHUB')).toMatchObject({ targetType: 'url', target: 'https://github.com' });
    expect(memory.list()).toHaveLength(1);
  });

  it('forgets', () => {
    const memory = new ResolverMemoryRepo(memoryDb());
    memory.set('github', 'url', 'https://github.com');
    expect(memory.remove('GitHub')).toBe(true);
    expect(memory.get('github')).toBeNull();
    expect(memory.remove('github')).toBe(false);
  });

  it('ignores empty phrases and targets', () => {
    const memory = new ResolverMemoryRepo(memoryDb());
    memory.set('  ', 'app', 'x');
    memory.set('x', 'app', '');
    expect(memory.list()).toEqual([]);
  });

  it.each([
    ['GitHub', 'github'],
    ['  Google   Chrome. ', 'google chrome'],
    ['Visual-Studio', 'visual studio'],
  ])('memoryKey(%j) → %j', (input, expected) => {
    expect(memoryKey(input)).toBe(expected);
  });
});

describe('SnippetRepo', () => {
  const repo = () => new SnippetRepo(memoryDb());

  it('adds, lists by trigger and removes', () => {
    const snippets = repo();
    snippets.upsert('zoom link', 'https://zoom.us/j/1');
    const cal = snippets.upsert('Calendly', 'Book here: https://calendly.com/me');
    expect(snippets.list().map((s) => s.trigger)).toEqual(['Calendly', 'zoom link']);
    expect(snippets.remove(cal.id)).toBe(true);
    expect(snippets.remove(cal.id)).toBe(false);
    expect(snippets.count()).toBe(1);
  });

  it('keeps line breaks and the exact text', () => {
    const snippets = repo();
    snippets.upsert('address', 'Line one\nLine two\t(tab)');
    expect(snippets.find('address')).toBe('Line one\nLine two\t(tab)');
  });

  it('finds the whole phrase only, ignoring case and punctuation', () => {
    const snippets = repo();
    snippets.upsert('calendly', 'LINK');
    expect(snippets.find('Calendly.')).toBe('LINK');
    expect(snippets.find('  CALENDLY  ')).toBe('LINK');
    expect(snippets.find('send me my calendly')).toBeNull();
    expect(snippets.find('calendly link')).toBeNull();
    expect(snippets.find('')).toBeNull();
  });

  it('the same trigger again (any case) replaces the text instead of duplicating', () => {
    const snippets = repo();
    const first = snippets.upsert('Calendly', 'old');
    const again = snippets.upsert('calendly!', 'new');
    expect(again.id).toBe(first.id);
    expect(snippets.count()).toBe(1);
    expect(snippets.find('calendly')).toBe('new');
  });

  it.each([
    ['   ', 'text', /words you will say/],
    ['!!!', 'text', /words you will say/],
    ['hello', '   ', /text to insert/],
    ['x'.repeat(61), 'text', /trigger is longer/],
    ['hello', 'y'.repeat(2001), /text is longer/],
    ['hello', 'bad\u0000text', /invalid characters/],
  ])('rejects %j / %j with a readable message', (trigger, body, message) => {
    expect(() => repo().upsert(trigger, body)).toThrow(SnippetError);
    expect(() => repo().upsert(trigger, body)).toThrow(message);
  });

  it(`stops at ${MAX_SNIPPETS} snippets`, () => {
    const snippets = repo();
    for (let i = 0; i < MAX_SNIPPETS; i++) snippets.upsert(`trigger number ${i}`, 'x');
    expect(() => snippets.upsert('one more', 'x')).toThrow(/Remove some first/);
    expect(() => snippets.upsert('trigger number 3', 'changed')).not.toThrow();
  });

  it('normalizeTrigger keeps letters and digits only', () => {
    expect(normalizeTrigger('  My  Zoom-Link! ')).toBe('my zoom link');
  });
});

describe('SettingsRepo', () => {
  const repo = () => new SettingsRepo(memoryDb());

  it('starts empty, saves changes, and keeps them', () => {
    const settings = repo();
    expect(settings.get()).toEqual({});
    settings.set({ pauseMs: 900, cleanupLevel: 'light', skipAi: false });
    expect(settings.get()).toEqual({ pauseMs: 900, cleanupLevel: 'light', skipAi: false });
  });

  it('changing one setting leaves the others', () => {
    const settings = repo();
    settings.set({ pauseMs: 900, previewMs: 2000 });
    settings.set({ pauseMs: 700 });
    expect(settings.get()).toEqual({ pauseMs: 700, previewMs: 2000 });
  });

  it('reset clears everything', () => {
    const settings = repo();
    settings.set({ historyKeep: 10 });
    settings.reset();
    expect(settings.get()).toEqual({});
  });

  it('ignores a stored value that is out of range or damaged', () => {
    const db = memoryDb();
    db.run("INSERT INTO setting (key, value, updated_at) VALUES ('pauseMs', '99999', 1)");
    db.run("INSERT INTO setting (key, value, updated_at) VALUES ('previewMs', 'not json', 1)");
    db.run("INSERT INTO setting (key, value, updated_at) VALUES ('mystery', '1', 1)");
    db.run("INSERT INTO setting (key, value, updated_at) VALUES ('historyKeep', '20', 1)");
    expect(new SettingsRepo(db).get()).toEqual({ historyKeep: 20 });
  });
});

describe('schema upgrade 4 → 5 (settings)', () => {
  it('adds the setting table and keeps snippets', () => {
    const db = openDb(':memory:');
    migrate(db, MIGRATIONS.slice(0, 4));
    expect(schemaVersion(db)).toBe(4);
    new SnippetRepo(db).upsert('calendly', 'LINK');
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(new SnippetRepo(db).find('calendly')).toBe('LINK');
    expect(new SettingsRepo(db).get()).toEqual({});
  });
});
