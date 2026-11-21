import { describe, expect, it } from 'vitest';
import { resolveHelperPath } from './binaryPath.ts';

const base = { appPath: '/repo/apps/desktop', resourcesPath: '/App.app/Contents/Resources' };

describe('resolveHelperPath', () => {
  it.each([
    [{ env: { SAYSO_HELPER_PATH: '/x/Helper' }, isPackaged: true }, '/x/Helper'],
    [{ env: {}, isPackaged: true }, '/App.app/Contents/Resources/SaysoHelper'],
    [{ env: {}, isPackaged: false }, '/repo/native/mac-helper/.build/debug/SaysoHelper'],
  ])('%o → %s', (input, expected) => {
    expect(resolveHelperPath({ ...base, ...input })).toBe(expected);
  });
});
