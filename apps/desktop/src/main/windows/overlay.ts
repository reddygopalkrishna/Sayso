import { BrowserWindow, screen } from 'electron';
import { loadView, preloadPath } from './load.ts';

export interface OverlayOptions {
  view: 'pill' | 'chip';
  width: number;
  height: number;
  /** Distance from the bottom edge of the screen's work area. */
  bottomOffset: number;
}

/**
 * A small floating, click-through panel at the bottom centre of the screen (the listening pill and
 * the preview chip). It never takes focus, so the app the user is dictating into stays focused.
 */
export class Overlay {
  private readonly win: BrowserWindow;
  private hideTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: OverlayOptions) {
    this.win = new BrowserWindow({
      width: opts.width,
      height: opts.height,
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
    loadView(this.win, opts.view);
  }

  show(): void {
    if (this.win.isDestroyed()) return;
    this.cancelHide();
    if (this.win.isVisible()) return;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.win.setPosition(
      Math.round(workArea.x + (workArea.width - this.opts.width) / 2),
      Math.round(workArea.y + workArea.height - this.opts.height - this.opts.bottomOffset),
    );
    this.win.showInactive();
  }

  /** A short delay avoids flicker between quick successive states. */
  hide(delayMs = 0): void {
    if (this.win.isDestroyed()) return;
    this.cancelHide();
    if (delayMs <= 0) {
      if (this.win.isVisible()) this.win.hide();
      return;
    }
    this.hideTimer = setTimeout(() => this.win.hide(), delayMs);
  }

  destroy(): void {
    this.cancelHide();
    if (!this.win.isDestroyed()) this.win.destroy();
  }

  private cancelHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}
