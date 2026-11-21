import { describe, expect, it, vi } from 'vitest';
import { initialStatus, type AppStatus } from '../../shared/status.ts';
import { buildTrayMenu, isReady, trayKey, trayStatusLine } from './trayMenu.ts';

const ready: AppStatus = {
  ...initialStatus,
  helper: { state: 'connected', helperVersion: '0.2.0', os: 'macOS' },
  stt: { state: 'ready', model: 'm' },
  permissions: { microphone: 'granted', accessibility: 'granted' },
};

const actions = () => ({ setHandsFree: vi.fn(), openWindow: vi.fn(), quit: vi.fn() });

describe('trayStatusLine', () => {
  it.each([
    ['the helper is starting', initialStatus, 'Starting…'],
    [
      'the helper is not built',
      { ...initialStatus, helper: { state: 'missing', path: '/x' } },
      'Helper not built',
    ],
    [
      'the model is loading',
      { ...ready, stt: { state: 'loading', model: 'm' } },
      'Speech model loading…',
    ],
    [
      'a permission is missing',
      { ...ready, permissions: { microphone: 'denied', accessibility: 'granted' } },
      'Needs permissions: open Sayso',
    ],
    ['everything is ready', ready, 'Ready to dictate'],
    [
      'hands-free listens',
      { ...ready, handsFree: { state: 'listening' } },
      'Hands-free is listening',
    ],
  ] as Array<[string, AppStatus, string]>)('%s → %j', (_label, status, line) => {
    expect(trayStatusLine(status)).toBe(line);
  });
});

describe('buildTrayMenu', () => {
  it('shows the status, the hands-free switch, Open and Quit', () => {
    const menu = buildTrayMenu(ready, actions());
    expect(menu.map((i) => i.label ?? i.type)).toEqual([
      'Ready to dictate',
      'separator',
      'Hands-free',
      'Open Sayso',
      'separator',
      'Quit Sayso',
    ]);
    expect(menu[0]?.enabled).toBe(false);
  });

  it('turns hands-free on, and off when it is on', () => {
    const a = actions();
    buildTrayMenu(ready, a)[2]?.click?.();
    const on = buildTrayMenu({ ...ready, handsFree: { state: 'listening' } }, a);
    expect(on[2]?.checked).toBe(true);
    on[2]?.click?.();
    expect(a.setHandsFree.mock.calls).toEqual([[true], [false]]);
  });

  it('cannot turn hands-free on before Sayso is ready, but can always turn it off', () => {
    const loading = { ...ready, stt: { state: 'loading', model: 'm' } } as AppStatus;
    expect(buildTrayMenu(loading, actions())[2]?.enabled).toBe(false);
    expect(
      buildTrayMenu({ ...loading, handsFree: { state: 'listening' } }, actions())[2]?.enabled,
    ).toBe(true);
  });

  it('opens the window and quits', () => {
    const a = actions();
    const menu = buildTrayMenu(ready, a);
    menu[3]?.click?.();
    menu[5]?.click?.();
    expect(a.openWindow).toHaveBeenCalledOnce();
    expect(a.quit).toHaveBeenCalledOnce();
  });
});

describe('trayKey', () => {
  it('does not change while dictating, so the menu is not rebuilt for every phase', () => {
    expect(trayKey({ ...ready, dictation: { phase: 'transcribing' } })).toBe(trayKey(ready));
  });

  it('changes when hands-free or readiness changes', () => {
    expect(trayKey({ ...ready, handsFree: { state: 'listening' } })).not.toBe(trayKey(ready));
    expect(isReady(initialStatus)).toBe(false);
    expect(trayKey(initialStatus)).not.toBe(trayKey(ready));
  });
});
