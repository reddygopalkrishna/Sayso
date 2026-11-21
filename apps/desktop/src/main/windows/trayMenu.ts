import type { AppStatus } from '../../shared/status.ts';

/** One menu-bar menu item, in the shape Electron's Menu.buildFromTemplate takes. */
export interface TrayItem {
  label?: string;
  type?: 'normal' | 'separator' | 'checkbox';
  enabled?: boolean;
  checked?: boolean;
  click?: () => void;
}

export interface TrayActions {
  setHandsFree: (on: boolean) => void;
  openWindow: () => void;
  quit: () => void;
}

/** Sayso can take dictation: the helper is up, the speech model loaded, permissions given. */
export function isReady(status: AppStatus): boolean {
  return (
    status.helper.state === 'connected' &&
    status.stt.state === 'ready' &&
    status.permissions.microphone === 'granted' &&
    status.permissions.accessibility === 'granted'
  );
}

/** The first line of the menu: what Sayso is doing, in a few words. */
export function trayStatusLine(status: AppStatus): string {
  switch (status.helper.state) {
    case 'missing':
      return 'Helper not built';
    case 'crashed':
      return 'Restarting…';
    case 'starting':
    case 'stopped':
      return 'Starting…';
    case 'connected':
      break;
  }
  if (status.stt.state !== 'ready') return 'Speech model loading…';
  if (
    status.permissions.microphone !== 'granted' ||
    status.permissions.accessibility !== 'granted'
  ) {
    return 'Needs permissions: open Sayso';
  }
  if (status.handsFree.state === 'listening') return 'Hands-free is listening';
  return 'Ready to dictate';
}

/** The menu-bar menu for the current status. Pure, so it is tested without Electron. */
export function buildTrayMenu(status: AppStatus, actions: TrayActions): TrayItem[] {
  const handsFreeOn =
    status.handsFree.state === 'listening' || status.handsFree.state === 'starting';
  return [
    { label: trayStatusLine(status), enabled: false },
    { type: 'separator' },
    {
      label: 'Hands-free',
      type: 'checkbox',
      checked: handsFreeOn,
      enabled: handsFreeOn || isReady(status),
      click: () => actions.setHandsFree(!handsFreeOn),
    },
    { label: 'Open Sayso', click: actions.openWindow },
    { type: 'separator' },
    { label: 'Quit Sayso', click: actions.quit },
  ];
}

/** What the menu depends on: rebuilt only when this changes, not on every dictation phase. */
export function trayKey(status: AppStatus): string {
  return `${trayStatusLine(status)}|${status.handsFree.state}|${isReady(status)}`;
}
