import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commands } from '../../packages/command-grammar/src/index.ts';
import { entitiesFound } from './metrics.ts';
import { commandIdFor } from './pipeline.ts';

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sample/manifest.json'), 'utf8'),
) as {
  samples: Array<{
    kind: string;
    file: string;
    script: string;
    expected?: string;
    entities?: string[];
    command?: string;
  }>;
};
const dictation = manifest.samples.filter((s) => s.kind === 'dictation');
const spoken = manifest.samples.filter((s) => s.kind === 'command');

describe('sample manifest', () => {
  it('has unique file names', () => {
    const files = manifest.samples.map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(dictation.map((s) => [s.file, s] as const))(
    '%s: every expected name is spelled in the expected text',
    (_file, s) => {
      expect(entitiesFound(s.entities ?? [], s.expected ?? '')).toEqual(s.entities);
    },
  );

  it.each(spoken.map((s) => [s.file, s] as const))(
    '%s: names a real command, and the script itself matches it',
    (_file, s) => {
      expect(commands.some((c) => c.id === s.command)).toBe(true);
      expect(commandIdFor(s.script, true)).toBe(s.command);
    },
  );
});
