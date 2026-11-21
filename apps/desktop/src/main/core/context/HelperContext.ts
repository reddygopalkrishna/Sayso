import type { HelperRequester } from '../../helper/HelperProcess.ts';

export interface AppContext {
  bundleId: string | null;
  appName: string | null;
  /** Accessibility role of the focused element (e.g. "AXTextField"); null when unknown. */
  focusRole: string | null;
  /** True when the focused element is a password field. */
  secureField: boolean;
}

export const unknownContext: AppContext = {
  bundleId: null,
  appName: null,
  focusRole: null,
  secureField: false,
};

// Some apps (WhatsApp) put invisible direction marks in their names.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Reads the frontmost app and focused element from the helper; never throws. */
export async function readContext(helper: HelperRequester): Promise<AppContext> {
  try {
    const reply = await helper.request({ type: 'getContext' }, { timeoutMs: 500 });
    if (reply.type !== 'context') return unknownContext;
    return {
      bundleId: reply.bundleId,
      appName: reply.appName?.replace(INVISIBLE, '').trim() || null,
      focusRole: reply.focusRole,
      secureField: reply.secureField,
    };
  } catch {
    return unknownContext;
  }
}
