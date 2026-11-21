import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAppLine, decodeHelperLine, encode } from './codec.ts';
import { AppMessageSchema, HelperMessageSchema } from './messages.ts';
import { buildSchemaDocument } from './schema.ts';

const fixturesDir = new URL('../fixtures/', import.meta.url);
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: f, text: readFileSync(new URL(f, fixturesDir), 'utf8') }));

describe('fixtures', () => {
  it('covers every message type', () => {
    const types = (prefix: string): string[] =>
      fixtures
        .filter((f) => f.name.startsWith(prefix))
        .map((f) => (JSON.parse(f.text) as { type: string }).type);
    expect(new Set(types('app.'))).toEqual(
      new Set(AppMessageSchema.options.map((o) => o.shape.type.value)),
    );
    expect(new Set(types('helper.'))).toEqual(
      new Set(HelperMessageSchema.options.map((o) => o.shape.type.value)),
    );
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
    [
      'word with negative time',
      '{"v":1,"type":"transcript","id":"a","text":"x","words":[{"text":"x","startMs":-1,"endMs":2,"p":1}],"audioMs":1,"sttMs":1,"model":"m"}',
    ],
    ['unknown hotkey phase', '{"v":1,"type":"hotkey","key":"fn","phase":"tap"}'],
    ['permission kind screen', '{"v":1,"type":"requestPermission","id":"a","kind":"screen"}'],
    [
      'microphone status maybe',
      '{"v":1,"type":"permissions","id":"a","microphone":"maybe","accessibility":true}',
    ],
    ['openURL with a file: URL', '{"v":1,"type":"openURL","id":"a","url":"file:///etc/passwd"}'],
    [
      'openURL with a custom scheme',
      '{"v":1,"type":"openURL","id":"a","url":"javascript:alert(1)"}',
    ],
    ['scroll by zero', '{"v":1,"type":"scroll","id":"a","direction":"down","amount":0}'],
    [
      'app info without running',
      '{"v":1,"type":"apps","id":"a","apps":[{"name":"X","bundleId":"x"}]}',
    ],
    [
      'context without secureField',
      '{"v":1,"type":"context","id":"a","bundleId":null,"appName":null,"focusRole":null}',
    ],
    ['captureEscape without enabled', '{"v":1,"type":"captureEscape","id":"a"}'],
    ['setHoldKey with an unknown key', '{"v":1,"type":"setHoldKey","id":"a","key":"capsLock"}'],
    ['setHoldKey without a key', '{"v":1,"type":"setHoldKey","id":"a"}'],
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
