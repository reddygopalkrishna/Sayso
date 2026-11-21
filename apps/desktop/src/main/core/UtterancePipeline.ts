import type { TextInserter } from './actions/HelperTextInserter.ts';
import type { CleanupResult, TextCleanup } from './cleanup/TextCleanup.ts';
import type { AppContext } from './context/HelperContext.ts';
import type { TranscriptSegment } from './stt/types.ts';

export interface UtteranceOutcome {
  segment: TranscriptSegment;
  context: AppContext;
  cleanup: CleanupResult;
  inserted: boolean;
}

export interface UtterancePipelineOptions {
  readContext: () => Promise<AppContext>;
  cleanup: TextCleanup;
  inserter: TextInserter;
  onOutcome?: (outcome: UtteranceOutcome) => void;
}

/**
 * What happens to a finished transcript: read the target app, clean up the text for it, insert.
 * Step 4 adds the IntentRouter (pause rule) in front of cleanup.
 */
export class UtterancePipeline {
  constructor(private readonly opts: UtterancePipelineOptions) {}

  async deliver(segment: TranscriptSegment): Promise<void> {
    const context = await this.opts.readContext();
    const cleanup = await this.opts.cleanup.clean({
      rawText: segment.text,
      bundleId: context.bundleId,
      appName: context.appName,
    });
    const inserted = cleanup.text !== '';
    if (inserted) await this.opts.inserter.insertText(cleanup.text);
    this.opts.onOutcome?.({ segment, context, cleanup, inserted });
  }
}
