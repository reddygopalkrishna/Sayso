import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.ts';

function files(...contents: string[]): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'sayso-env-'));
  return contents.map((content, i) => {
    const path = join(dir, `${i}.env`);
    writeFileSync(path, content);
    return path;
  });
}

describe('loadConfig', () => {
  it('reads later files over earlier ones and the real environment over both', () => {
    const paths = files('GEMINI_API_KEY=repo\nSAYSO_CLEANUP_LEVEL=light', 'GEMINI_API_KEY=user');
    expect(loadConfig(paths, {})).toEqual({
      geminiApiKey: 'user',
      geminiModel: undefined,
      cleanupLevel: 'light',
      pauseMs: 600,
      previewMs: 1000,
      historyKeep: 50,
      style: 'default',
      holdKey: 'fn',
      wakeWord: 'sayso',
      language: 'en',
      skipAi: true,
      groqApiKey: null,
      fastModel: 'qwen/qwen3.8-27b',
      aiProvider: 'auto',
    });
    expect(loadConfig(paths, { GEMINI_API_KEY: 'env' }).geminiApiKey).toBe('env');
  });

  it('does not copy keys into process.env', () => {
    const before = process.env['GEMINI_API_KEY'];
    loadConfig(files('GEMINI_API_KEY=secret'), {});
    expect(process.env['GEMINI_API_KEY']).toBe(before);
  });

  it('defaults to full cleanup with no key when nothing is set', () => {
    expect(loadConfig(['/does/not/exist'], {})).toEqual({
      geminiApiKey: null,
      geminiModel: undefined,
      cleanupLevel: 'full',
      pauseMs: 600,
      previewMs: 1000,
      historyKeep: 50,
      style: 'default',
      holdKey: 'fn',
      wakeWord: 'sayso',
      language: 'en',
      skipAi: true,
      groqApiKey: null,
      fastModel: 'qwen/qwen3.8-27b',
      aiProvider: 'auto',
    });
  });

  it.each([
    ['800', 800],
    ['50', 600],
    ['abc', 600],
    ['5000', 600],
  ])('SAYSO_PAUSE_MS=%s → %i ms', (value, expected) => {
    expect(loadConfig(files(`SAYSO_PAUSE_MS=${value}`), {}).pauseMs).toBe(expected);
  });

  it.each([
    ['1500', 1500],
    ['100', 1000],
    ['x', 1000],
    ['9000', 1000],
  ])('SAYSO_PREVIEW_MS=%s → %i ms', (value, expected) => {
    expect(loadConfig(files(`SAYSO_PREVIEW_MS=${value}`), {}).previewMs).toBe(expected);
  });

  it.each([
    ['0', 0], // history off
    ['200', 200],
    ['-1', 50],
    ['2000', 50],
    ['1.5', 50],
    ['many', 50],
  ])('SAYSO_HISTORY_KEEP=%s → %i', (value, expected) => {
    expect(loadConfig(files(`SAYSO_HISTORY_KEEP=${value}`), {}).historyKeep).toBe(expected);
  });

  it.each([
    ['off', false],
    ['OFF', false],
    ['false', false],
    ['0', false],
    ['no', false],
    ['on', true],
    ['yes', true],
    ['', true],
    ['maybe', true],
  ])('SAYSO_SKIP_AI=%s → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_SKIP_AI=${value}`), {}).skipAi).toBe(expected);
  });

  it('reads the Groq key without copying it into process.env', () => {
    const before = process.env['GROQ_API_KEY'];
    const config = loadConfig(files('GROQ_API_KEY=gsk_secret\nGEMINI_API_KEY=g'), {});
    expect(config.groqApiKey).toBe('gsk_secret');
    expect(config.geminiApiKey).toBe('g');
    expect(process.env['GROQ_API_KEY']).toBe(before);
    expect(loadConfig(files('GROQ_API_KEY='), {}).groqApiKey).toBeNull();
  });

  it.each([
    ['openai/gpt-oss-120b', 'openai/gpt-oss-120b'],
    ['llama-3.1-8b-instant', 'llama-3.1-8b-instant'],
    ['', 'qwen/qwen3.8-27b'],
    ['has space', 'qwen/qwen3.8-27b'],
    ['bad;rm -rf', 'qwen/qwen3.8-27b'],
  ])('SAYSO_FAST_MODEL=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_FAST_MODEL=${value}`), {}).fastModel).toBe(expected);
  });

  it.each([
    ['gemini', 'gemini'],
    ['GROQ', 'groq'],
    ['auto', 'auto'],
    ['', 'auto'],
    ['openai', 'auto'],
  ])('SAYSO_AI_PROVIDER=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_AI_PROVIDER=${value}`), {}).aiProvider).toBe(expected);
  });

  it('ignores an empty key and an unknown level', () => {
    expect(loadConfig(files('GEMINI_API_KEY=\nSAYSO_CLEANUP_LEVEL=max'), {})).toMatchObject({
      geminiApiKey: null,
      cleanupLevel: 'full',
    });
  });
});

describe('style in the config', () => {
  it.each([
    ['chill', 'chill'],
    ['CHILL', 'chill'],
    ['default', 'default'],
    ['loud', 'default'],
    ['', 'default'],
  ])('SAYSO_STYLE=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_STYLE=${value}`), {}).style).toBe(expected);
  });
});

describe('hold key in the config', () => {
  it.each([
    ['fn', 'fn'],
    ['rightOption', 'rightOption'],
    ['rightCommand', 'rightCommand'],
    ['rightControl', 'rightControl'],
    ['capsLock', 'fn'],
    ['leftCommand', 'fn'],
    ['', 'fn'],
  ])('SAYSO_HOLD_KEY=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_HOLD_KEY=${value}`), {}).holdKey).toBe(expected);
  });
});

describe('wake word in the config', () => {
  it.each([
    ['Kairo', 'kairo'],
    ['vaani', 'vaani'],
    ['', 'sayso'],
    ['two words', 'sayso'],
    ['x', 'sayso'],
    ['9lives', 'sayso'],
  ])('SAYSO_WAKE_WORD=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_WAKE_WORD=${value}`), {}).wakeWord).toBe(expected);
  });
});

describe('language in the config', () => {
  it.each([
    ['te', 'te'],
    ['HI', 'hi'],
    ['auto', 'auto'],
    ['en', 'en'],
    ['', 'en'],
    ['telugu', 'en'],
    ['xx', 'en'],
  ])('SAYSO_STT_LANGUAGE=%j → %s', (value, expected) => {
    expect(loadConfig(files(`SAYSO_STT_LANGUAGE=${value}`), {}).language).toBe(expected);
  });
});
