import { describe, expect, it } from 'vitest';
import type { HelperRequester } from '../../helper/HelperProcess.ts';
import { readContext, unknownContext } from './HelperContext.ts';

const reply = (over: Record<string, unknown> = {}): HelperRequester => ({
  request: async () => ({
    v: 1,
    type: 'context',
    id: 'r-1',
    bundleId: 'com.apple.mail',
    appName: 'Mail',
    focusRole: 'AXTextArea',
    secureField: false,
    ...over,
  }),
});

describe('readContext', () => {
  it('returns the frontmost app and the focused element', async () => {
    await expect(readContext(reply())).resolves.toEqual({
      bundleId: 'com.apple.mail',
      appName: 'Mail',
      focusRole: 'AXTextArea',
      secureField: false,
    });
  });

  it('reports password fields', async () => {
    const context = await readContext(reply({ focusRole: 'AXTextField', secureField: true }));
    expect(context.secureField).toBe(true);
  });

  it('removes invisible direction marks from app names (WhatsApp)', async () => {
    const context = await readContext(reply({ appName: '‎WhatsApp' }));
    expect(context.appName).toBe('WhatsApp');
  });

  it('falls back to an unknown context when the helper fails', async () => {
    const helper: HelperRequester = { request: () => Promise.reject(new Error('gone')) };
    await expect(readContext(helper)).resolves.toEqual(unknownContext);
  });

  it('an unknown context is not a password field', () => {
    expect(unknownContext.secureField).toBe(false);
  });
});
