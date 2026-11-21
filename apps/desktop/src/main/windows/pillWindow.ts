import { BrowserWindow, screen } from 'electron';
import type { DictationState } from '../../shared/status.ts';
import { loadView, preloadPath } from './load.ts';

const WIDTH = 220;
const HEIGHT = 44;
const BOTTOM_MARGIN = 28;

/**
 * The listening pill: a small floating panel near the bottom of the screen. It never takes focus,
 * so the app the user is dictating into stays focused and receives the paste.
 */
export class PillWindow {
  private readonly win: BrowserWindow;
  private hideTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      type: 'panel',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.setIgnoreMouseEvents(true);
    loadView(this.win, 'pill');
  }

  show(state: DictationState): void {
    if (this.win.isDestroyed()) return;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (state.phase === 'idle') {
      // A short delay avoids flicker between quick utterances.
      this.hideTimer = setTimeout(() => this.win.hide(), 150);
      return;
    }
    if (!this.win.isVisible()) {
      const cursor = screen.getCursorScreenPoint();
      const { workArea } = screen.getDisplayNearestPoint(cursor);
      this.win.setPosition(
        Math.round(workArea.x + (workArea.width - WIDTH) / 2),
        Math.round(workArea.y + workArea.height - HEIGHT - BOTTOM_MARGIN),
      );
      this.win.showInactive();
    }
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
