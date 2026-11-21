import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAppLine, decodeHelperLine, encode } from './codec.ts';
import { buildSchemaDocument } from './schema.ts';

const fixturesDir = new URL('../fixtures/', import.meta.url);
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: f, text: readFileSync(new URL(f, fixturesDir), 'utf8') }));

describe('fixtures', () => {
  it('covers every message type', () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      'app.ping.json',
      'app.shutdown.json',
      'helper.error.json',
      'helper.log.json',
      'helper.pong.json',
      'helper.ready.json',
    ]);
  });

  it.each(fixtures)('$name decodes and round-trips', ({ name, text }) => {
    const decode = name.startsWith('app.') ? decodeAppLine : decodeHelperLine;
    const first = decode(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const line = encode(first.message);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(decode(line)).toEqual(first);
  });
});

describe('decodeHelperLine rejects bad input', () => {
  it.each([
    ['empty line', ''],
    ['whitespace', '   '],
    ['invalid JSON', '{"v":1,'],
    ['not an object', '42'],
    ['unknown type', '{"v":1,"type":"explode"}'],
    ['wrong version', '{"v":2,"type":"pong","id":"a"}'],
    ['missing field', '{"v":1,"type":"pong"}'],
    ['extra field', '{"v":1,"type":"pong","id":"a","x":1}'],
    ['bad log level', '{"v":1,"type":"log","level":"loud","msg":"x"}'],
    ['app message on helper channel', '{"v":1,"type":"ping","id":"a"}'],
  ])('%s', (_label, line) => {
    const result = decodeHelperLine(line);
    expect(result.ok).toBe(false);
  });
});

describe('JSON schema', () => {
  it('schema/messages.schema.json is up to date (run pnpm gen:schema)', () => {
    const onDisk: unknown = JSON.parse(
      readFileSync(new URL('../schema/messages.schema.json', import.meta.url), 'utf8'),
    );
    expect(onDisk).toEqual(buildSchemaDocument());
  });
});
