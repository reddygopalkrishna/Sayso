import { describe, expect, it } from 'vitest';
import type { HelperRequester } from '../../helper/HelperProcess.ts';
import { readContext, unknownContext } from './HelperContext.ts';

describe('readContext', () => {
  it('returns the frontmost app', async () => {
    const helper: HelperRequester = {
      request: async () => ({
        v: 1,
        type: 'context',
        id: 'r-1',
        bundleId: 'com.apple.mail',
        appName: 'Mail',
      }),
    };
    await expect(readContext(helper)).resolves.toEqual({
      bundleId: 'com.apple.mail',
      appName: 'Mail',
    });
  });

  it('falls back to an unknown context when the helper fails', async () => {
    const helper: HelperRequester = { request: () => Promise.reject(new Error('gone')) };
    await expect(readContext(helper)).resolves.toEqual(unknownContext);
  });
});
