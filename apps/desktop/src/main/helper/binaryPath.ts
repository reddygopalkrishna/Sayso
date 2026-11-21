import { join, resolve } from 'node:path';

/**
 * Where the helper binary lives. `SAYSO_HELPER_PATH` wins; packaged builds ship it in Resources;
 * in development it is the SwiftPM debug build in the monorepo.
 */
export function resolveHelperPath(opts: {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
}): string {
  const override = opts.env['SAYSO_HELPER_PATH'];
  if (override) return override;
  if (opts.isPackaged) return join(opts.resourcesPath, 'SaysoHelper');
  return resolve(opts.appPath, '../../native/mac-helper/.build/debug/SaysoHelper');
}
