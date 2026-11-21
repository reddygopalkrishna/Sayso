import type { HelperRequester } from '../../helper/HelperProcess.ts';

export interface TextInserter {
  insertText(text: string): Promise<void>;
}

/** Pastes into the focused field via the helper (clipboard is restored afterwards). */
export class HelperTextInserter implements TextInserter {
  constructor(private readonly helper: HelperRequester) {}

  async insertText(text: string): Promise<void> {
    await this.helper.request({ type: 'insertText', text }, { timeoutMs: 5_000 });
  }
}
