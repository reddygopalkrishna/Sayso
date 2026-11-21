import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { DEFAULT_FAST_MODEL } from '../core/cleanup/providers.ts';
import type { CleanupLevel } from '../core/cleanup/types.ts';
import { HOLD_KEYS, type HoldKeyName, type Style } from '../../shared/settings.ts';

export interface AppConfig {
  geminiApiKey: string | null;
  geminiModel: string | undefined;
  /** Groq key: when set, Groq is tried first (about 0.2 s) and Gemini is the fallback. */
  groqApiKey: string | null;
  /** The Groq model; Groq's lineup changes, so this is a setting. */
  fastModel: string;
  /** auto: Groq first when it has a key. gemini / groq: only that one (keeps text away from the other). */
  aiProvider: 'auto' | 'gemini' | 'groq';
  cleanupLevel: CleanupLevel;
  /** Silence before a trailing "send"/"enter"/"new line" for it to run as a command (pause rule). */
  pauseMs: number;
  /** How long the preview chip shows before a Normal-level action runs (Esc cancels). */
  previewMs: number;
  /** Skip the AI for short text the local rules can finish. On by default. */
  skipAi: boolean;
  /** History rows to keep (PRD: the last 50). 0 turns history off. */
  historyKeep: number;
  /** Default or chill: how dictated text looks, unless an app has its own style. */
  style: Style;
  /** The key held to dictate: fn (default), rightOption, rightCommand or rightControl. */
  holdKey: HoldKeyName;
}

/**
 * Reads `.env` files into a config object for the main process only. They are not copied into
 * process.env, so keys never reach the helper's environment or the renderer.
 * Later files win: repo `.env` (dev) < userData `.env` < real environment variables.
 */
export function loadConfig(envFiles: readonly string[], processEnv: NodeJS.ProcessEnv): AppConfig {
  const merged: Record<string, string | undefined> = {};
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    Object.assign(merged, parseEnv(readFileSync(file, 'utf8')));
  }
  for (const key of [
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'SAYSO_CLEANUP_LEVEL',
    'SAYSO_PAUSE_MS',
    'SAYSO_PREVIEW_MS',
    'SAYSO_HISTORY_KEEP',
    'SAYSO_SKIP_AI',
    'SAYSO_STYLE',
    'SAYSO_HOLD_KEY',
    'GROQ_API_KEY',
    'SAYSO_FAST_MODEL',
    'SAYSO_AI_PROVIDER',
  ]) {
    if (processEnv[key]) merged[key] = processEnv[key];
  }
  const level = merged['SAYSO_CLEANUP_LEVEL'];
  const pause = Number(merged['SAYSO_PAUSE_MS']);
  const preview = Number(merged['SAYSO_PREVIEW_MS']);
  const keep = Number(merged['SAYSO_HISTORY_KEEP']);
  const fastModel = (merged['SAYSO_FAST_MODEL'] ?? '').trim();
  const aiProvider = (merged['SAYSO_AI_PROVIDER'] ?? '').trim().toLowerCase();
  return {
    geminiApiKey: merged['GEMINI_API_KEY']?.trim() || null,
    geminiModel: merged['GEMINI_MODEL']?.trim() || undefined,
    groqApiKey: merged['GROQ_API_KEY']?.trim() || null,
    // A model id is letters, digits and . _ / : - only; anything else would be a typo or worse.
    fastModel: /^[\w./:-]{1,100}$/.test(fastModel) ? fastModel : DEFAULT_FAST_MODEL,
    aiProvider: aiProvider === 'gemini' || aiProvider === 'groq' ? aiProvider : 'auto',
    cleanupLevel: level === 'off' || level === 'light' || level === 'full' ? level : 'full',
    pauseMs: Number.isFinite(pause) && pause >= 200 && pause <= 3000 ? pause : 600,
    previewMs: Number.isFinite(preview) && preview >= 300 && preview <= 5000 ? preview : 1000,
    historyKeep: Number.isInteger(keep) && keep >= 0 && keep <= 1000 ? keep : 50,
    style: (merged['SAYSO_STYLE'] ?? '').trim().toLowerCase() === 'chill' ? 'chill' : 'default',
    holdKey: HOLD_KEYS.find((key) => key === (merged['SAYSO_HOLD_KEY'] ?? '').trim()) ?? 'fn',
    skipAi: !['off', 'false', '0', 'no'].includes(
      (merged['SAYSO_SKIP_AI'] ?? '').trim().toLowerCase(),
    ),
  };
}
