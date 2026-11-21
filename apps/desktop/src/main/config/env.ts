import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { CleanupLevel } from '../core/cleanup/types.ts';

export interface AppConfig {
  geminiApiKey: string | null;
  geminiModel: string | undefined;
  cleanupLevel: CleanupLevel;
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
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'SAYSO_CLEANUP_LEVEL']) {
    if (processEnv[key]) merged[key] = processEnv[key];
  }
  const level = merged['SAYSO_CLEANUP_LEVEL'];
  return {
    geminiApiKey: merged['GEMINI_API_KEY']?.trim() || null,
    geminiModel: merged['GEMINI_MODEL']?.trim() || undefined,
    cleanupLevel: level === 'off' || level === 'light' || level === 'full' ? level : 'full',
  };
}
