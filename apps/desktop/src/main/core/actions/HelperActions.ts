import type { HoldKeyName } from '../../../shared/settings.ts';
import type { AppInfo, Key, Modifier } from '@sayso/helper-protocol';
import type { HelperRequester } from '../../helper/HelperProcess.ts';

export interface TextInserter {
  insertText(text: string): Promise<void>;
}

export interface KeyPresser {
  pressKey(key: Key, modifiers: readonly Modifier[]): Promise<void>;
}

/** Actions carried out by the helper: paste text (clipboard restored afterwards) and press keys. */
/** Instant-command actions the helper carries out. */
export interface CommandActions {
  scroll(direction: 'up' | 'down', amount: number): Promise<void>;
  pressElement(label: string): Promise<void>;
  listApps(): Promise<AppInfo[]>;
  openApp(bundleId: string): Promise<void>;
  activateApp(bundleId: string): Promise<void>;
  openUrl(url: string): Promise<void>;
}

/** Actions carried out by the helper: paste text (clipboard restored afterwards), keys, apps. */
export class HelperActions implements TextInserter, KeyPresser, CommandActions {
  constructor(private readonly helper: HelperRequester) {}

  async insertText(text: string): Promise<void> {
    await this.helper.request({ type: 'insertText', text }, { timeoutMs: 5_000 });
  }

  async scroll(direction: 'up' | 'down', amount: number): Promise<void> {
    await this.helper.request({ type: 'scroll', direction, amount }, { timeoutMs: 2_000 });
  }

  /** Press a visible button, link or menu item by its label (Accessibility). */
  async pressElement(label: string): Promise<void> {
    await this.helper.request({ type: 'pressElement', label }, { timeoutMs: 3_000 });
  }

  async listApps(): Promise<AppInfo[]> {
    // The first call scans the Applications folders if the helper's background scan is not done.
    const reply = await this.helper.request({ type: 'listApps' }, { timeoutMs: 5_000 });
    if (reply.type !== 'apps') throw new Error(`expected apps, got ${reply.type}`);
    return reply.apps;
  }

  async openApp(bundleId: string): Promise<void> {
    await this.helper.request({ type: 'openApp', bundleId }, { timeoutMs: 10_000 });
  }

  async activateApp(bundleId: string): Promise<void> {
    await this.helper.request({ type: 'activateApp', bundleId }, { timeoutMs: 5_000 });
  }

  async openUrl(url: string): Promise<void> {
    await this.helper.request({ type: 'openURL', url }, { timeoutMs: 5_000 });
  }

  /** Swallow Escape (and report it) while the preview chip is showing. */
  async captureEscape(enabled: boolean): Promise<void> {
    await this.helper.request({ type: 'captureEscape', enabled }, { timeoutMs: 1_000 });
  }

  /** Hands-free: keep the microphone on; each utterance arrives later as a `heard` event. */
  async startListening(): Promise<void> {
    await this.helper.request({ type: 'startListening' }, { timeoutMs: 10_000 });
  }

  async stopListening(): Promise<void> {
    await this.helper.request({ type: 'stopListening' }, { timeoutMs: 30_000 });
  }

  /** Change the key that is held to dictate (Fn, or a right-hand modifier key). */
  async setHoldKey(key: HoldKeyName): Promise<void> {
    await this.helper.request({ type: 'setHoldKey', key }, { timeoutMs: 1_000 });
  }

  async pressKey(key: Key, modifiers: readonly Modifier[]): Promise<void> {
    await this.helper.request(
      { type: 'keyPress', key, modifiers: [...modifiers] },
      { timeoutMs: 2_000 },
    );
  }
}
