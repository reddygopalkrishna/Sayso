import type { HelperRequester } from '../../helper/HelperProcess.ts';

export interface AppContext {
  bundleId: string | null;
  appName: string | null;
}

export const unknownContext: AppContext = { bundleId: null, appName: null };

/** Reads the frontmost app from the helper; never throws (unknown context on failure). */
export async function readContext(helper: HelperRequester): Promise<AppContext> {
  try {
    const reply = await helper.request({ type: 'getContext' }, { timeoutMs: 500 });
    if (reply.type !== 'context') return unknownContext;
    return { bundleId: reply.bundleId, appName: reply.appName };
  } catch {
    return unknownContext;
  }
}
