import type { Key, Modifier } from '@sayso/helper-protocol';
import type { HelperRequester } from '../../helper/HelperProcess.ts';

export interface TextInserter {
  insertText(text: string): Promise<void>;
}

export interface KeyPresser {
  pressKey(key: Key, modifiers: readonly Modifier[]): Promise<void>;
}

/** Actions carried out by the helper: paste text (clipboard restored afterwards) and press keys. */
export class HelperActions implements TextInserter, KeyPresser {
  constructor(private readonly helper: HelperRequester) {}

  async insertText(text: string): Promise<void> {
    await this.helper.request({ type: 'insertText', text }, { timeoutMs: 5_000 });
  }

  /** Swallow Escape (and report it) while the preview chip is showing. */
  async captureEscape(enabled: boolean): Promise<void> {
    await this.helper.request({ type: 'captureEscape', enabled }, { timeoutMs: 1_000 });
  }

  async pressKey(key: Key, modifiers: readonly Modifier[]): Promise<void> {
    await this.helper.request(
      { type: 'keyPress', key, modifiers: [...modifiers] },
      { timeoutMs: 2_000 },
    );
  }
}
