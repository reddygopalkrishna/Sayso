/**
 * Benchmark: the same recordings through plain Whisper and through Sayso's text pipeline.
 *
 *   scripts/benchmark/bench.sh <folder with manifest.json and .wav files> [--ai] [--json out.json]
 *
 * Plain Whisper = `SaysoHelper --transcribe`, text as it comes out. Sayso = the same transcript
 * after Sayso's own steps (names, local cleanup, address formatting; with --ai also the AI
 * cleanup and the interpreter, using the keys in .env). See docs/BENCHMARK.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../apps/desktop/src/main/config/env.ts';
import {
  OpenAIChatJson,
  type ChatJson,
} from '../../apps/desktop/src/main/core/interpret/chatJson.ts';
import { Interpreter } from '../../apps/desktop/src/main/core/interpret/Interpreter.ts';
import {
  buildProvider,
  GROQ_BASE_URL,
  groqRequestExtras,
} from '../../apps/desktop/src/main/core/cleanup/providers.ts';
import { commandIdFor, interpretedCommandId, sayso } from './pipeline.ts';
import { entitiesFound, fillerCount, mean, percent, wordErrorRate } from './metrics.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const helperPath =
  process.env['SAYSO_HELPER'] ?? join(root, 'native/mac-helper/.build/debug/SaysoHelper');

type SampleT =
  | {
      kind: 'dictation';
      file: string;
      /** What to read aloud, hesitations included. */
      script: string;
      /** What should be typed. */
      expected: string;
      entities: string[];
    }
  | {
      kind: 'command';
      file: string;
      script: string;
      /** The command id from commands.json that should run. */
      command: string;
    };

/** Reads manifest.json, with a clear message for a bad entry. */
function readManifest(path: string): { samples: SampleT[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { samples?: unknown };
  if (!Array.isArray(raw.samples)) throw new Error(`${path}: "samples" must be a list`);
  const samples = raw.samples.map((item: Record<string, unknown>, i: number): SampleT => {
    const text = (key: string): string => {
      const value = item[key];
      if (typeof value !== 'string' || value === '')
        throw new Error(`${path}: sample ${i + 1} needs "${key}" as text`);
      return value;
    };
    if (item['kind'] === 'dictation') {
      const entities = item['entities'] ?? [];
      if (!Array.isArray(entities) || entities.some((e) => typeof e !== 'string'))
        throw new Error(`${path}: sample ${i + 1}: "entities" must be a list of text`);
      return {
        kind: 'dictation',
        file: text('file'),
        script: text('script'),
        expected: text('expected'),
        entities: entities as string[],
      };
    }
    if (item['kind'] === 'command')
      return {
        kind: 'command',
        file: text('file'),
        script: text('script'),
        command: text('command'),
      };
    throw new Error(`${path}: sample ${i + 1}: "kind" must be "dictation" or "command"`);
  });
  return { samples };
}

type Cache = Record<string, { text: string; sttMs: number }>;

function transcribe(path: string, cache: Cache): { text: string; sttMs: number } {
  const key = `${path}:${statSync(path).size}:${statSync(path).mtimeMs}`;
  const hit = cache[key];
  if (hit) return hit;
  const run = spawnSync(helperPath, ['--transcribe', path], { encoding: 'utf8', timeout: 300_000 });
  const line = run.stdout.split('\n').find((l) => l.includes('"type":"transcript"'));
  if (!line) throw new Error(`no transcript for ${path}: ${run.stderr.slice(-300)}`);
  const message = JSON.parse(line) as { text: string; sttMs: number };
  const entry = { text: message.text, sttMs: message.sttMs };
  cache[key] = entry;
  return entry;
}

function argValue(args: readonly string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

export async function main(args: readonly string[]): Promise<string> {
  const folder = args[0];
  if (!folder || folder.startsWith('--')) {
    throw new Error('usage: scripts/benchmark/bench.sh <folder> [--ai] [--json out.json]');
  }
  if (!existsSync(helperPath)) {
    throw new Error(`SaysoHelper not found at ${helperPath}. Run: pnpm helper:build`);
  }
  const dir = resolve(folder);
  const manifest = readManifest(join(dir, 'manifest.json'));
  const useAi = args.includes('--ai');

  let provider = null;
  let interpreter: Interpreter | null = null;
  if (useAi) {
    const config = loadConfig([join(root, '.env')], process.env);
    provider = buildProvider(config).provider;
    const clients: ChatJson[] = [];
    if (config.groqApiKey && config.aiProvider !== 'gemini')
      clients.push(
        new OpenAIChatJson({
          name: 'groq',
          model: config.fastModel,
          apiKey: config.groqApiKey,
          baseUrl: GROQ_BASE_URL,
          extraBody: groqRequestExtras(config.fastModel),
        }),
      );
    if (config.openaiApiKey && config.openaiModel)
      clients.push(
        new OpenAIChatJson({
          name: 'openai',
          model: config.openaiModel,
          apiKey: config.openaiApiKey,
          baseUrl: 'https://api.openai.com/v1',
        }),
      );
    interpreter = new Interpreter({ clients });
    if (!provider) console.error('--ai: no AI key found in .env; cleanup stays local.');
    if (!interpreter.available)
      console.error('--ai: no key for the interpreter; that column is skipped.');
  }

  const cachePath = join(dir, 'transcripts.json');
  const cache: Cache = existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, 'utf8')) as Cache)
    : {};

  const dictation: Array<{
    s: Extract<SampleT, { kind: 'dictation' }>;
    plain: string;
    sayso: string;
    method: string;
    sttMs: number;
  }> = [];
  const commandRows: Array<{
    s: Extract<SampleT, { kind: 'command' }>;
    plain: string;
    plainGrammar: boolean;
    saysoGrammar: boolean;
    interpreted: boolean | null;
  }> = [];

  for (const s of manifest.samples) {
    const heard = transcribe(join(dir, s.file), cache);
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    if (s.kind === 'dictation') {
      const out = await sayso(heard.text, provider);
      dictation.push({
        s,
        plain: heard.text,
        sayso: out.text,
        method: out.method,
        sttMs: heard.sttMs,
      });
    } else {
      const exact = commandIdFor(heard.text, true);
      let interpreted: boolean | null = null;
      if (interpreter?.available) {
        const id = exact ?? (await interpretedCommandId(heard.text, interpreter));
        interpreted = id === s.command;
      }
      commandRows.push({
        s,
        plain: heard.text,
        plainGrammar: commandIdFor(heard.text, false) === s.command,
        saysoGrammar: exact === s.command,
        interpreted,
      });
    }
  }

  const report: string[] = [];
  const line = (text = ''): number => report.push(text);
  line(`# Benchmark: ${manifest.samples.length} recordings from ${dir}`);
  line();
  line(`Cleanup: ${useAi && provider ? 'AI cleanup on (from .env)' : 'local rules only (no AI)'}.`);
  line();

  if (dictation.length > 0) {
    const werPlain = mean(dictation.map((d) => wordErrorRate(d.s.expected, d.plain)));
    const werSayso = mean(dictation.map((d) => wordErrorRate(d.s.expected, d.sayso)));
    const entityTotal = dictation.reduce((n, d) => n + d.s.entities.length, 0);
    const found = (pick: 'plain' | 'sayso'): number =>
      dictation.reduce((n, d) => n + entitiesFound(d.s.entities, d[pick]).length, 0);
    const spokenFillers = dictation.reduce((n, d) => n + fillerCount(d.s.script), 0);
    const left = (pick: 'plain' | 'sayso'): number =>
      dictation.reduce((n, d) => n + fillerCount(d[pick]), 0);
    line(`## Dictation (${dictation.length} recordings)`);
    line();
    line('| Measure | Plain Whisper | Sayso |');
    line('|---|---|---|');
    line(`| Word error rate (lower is better) | ${percent(werPlain)} | ${percent(werSayso)} |`);
    line(
      `| Indian names and entities spelled exactly (${entityTotal} expected) | ${found('plain')} (${percent(entityTotal ? found('plain') / entityTotal : 0)}) | ${found('sayso')} (${percent(entityTotal ? found('sayso') / entityTotal : 0)}) |`,
    );
    line(`| Filler words left (${spokenFillers} said) | ${left('plain')} | ${left('sayso')} |`);
    line(
      `| Median speech-to-text time | ${Math.round(median(dictation.map((d) => d.sttMs)))} ms | same |`,
    );
    line();
    line('| File | Expected | Plain Whisper | Sayso | Cleanup |');
    line('|---|---|---|---|---|');
    for (const d of dictation)
      line(`| ${d.s.file} | ${d.s.expected} | ${d.plain} | ${d.sayso} | ${d.method} |`);
    line();
  }

  if (commandRows.length > 0) {
    const n = commandRows.length;
    const count = (f: (r: (typeof commandRows)[number]) => boolean): string => {
      const c = commandRows.filter(f).length;
      return `${c}/${n} (${percent(c / n)})`;
    };
    line(`## Commands (${n} recordings)`);
    line();
    line('| How it is understood | Success |');
    line('|---|---|');
    line(`| Plain Whisper text, exact grammar | ${count((r) => r.plainGrammar)} |`);
    line(
      `| Sayso (names applied), exact grammar and close mishearings | ${count((r) => r.saysoGrammar)} |`,
    );
    line(
      `| Sayso with the interpreter | ${commandRows.some((r) => r.interpreted !== null) ? count((r) => r.interpreted === true) : 'not run (add --ai and a key in .env)'} |`,
    );
    line();
    line('| File | Said | Heard | Wanted | Exact | Interpreter |');
    line('|---|---|---|---|---|---|');
    for (const r of commandRows)
      line(
        `| ${r.s.file} | ${r.s.script} | ${r.plain} | ${r.s.command} | ${r.saysoGrammar ? 'yes' : 'no'} | ${r.interpreted === null ? '-' : r.interpreted ? 'yes' : 'no'} |`,
      );
    line();
  }

  const text = report.join('\n');
  writeFileSync(join(dir, 'report.md'), `${text}\n`);
  const jsonOut = argValue(args, '--json');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ dictation, commandRows }, null, 2));
  return text;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
