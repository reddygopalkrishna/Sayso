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

  it('ignores an empty key and an unknown level', () => {
    expect(loadConfig(files('GEMINI_API_KEY=\nSAYSO_CLEANUP_LEVEL=max'), {})).toMatchObject({
      geminiApiKey: null,
      cleanupLevel: 'full',
    });
  });
});
