import { describe, expect, it, vi } from 'vitest';
import { UtterancePipeline, type UtteranceOutcome } from './UtterancePipeline.ts';
import { TextCleanup } from './cleanup/TextCleanup.ts';
import type { LLMProvider } from './cleanup/types.ts';
import type { TranscriptSegment } from './stt/types.ts';

const segment = (text: string): TranscriptSegment => ({
  text,
  words: [],
  audioMs: 900,
  sttMs: 150,
  model: 'm',
});

function setup(llmText: string, bundleId = 'com.tinyspeck.slackmacgap') {
  const provider: LLMProvider = { name: 'fake', model: 'f', cleanup: async () => llmText };
  const inserted: string[] = [];
  const outcomes: UtteranceOutcome[] = [];
  const pipeline = new UtterancePipeline({
    readContext: vi.fn(async () => ({ bundleId, appName: 'Slack' })),
    cleanup: new TextCleanup({ provider, level: () => 'full' }),
    inserter: { insertText: async (t) => void inserted.push(t) },
    onOutcome: (o) => outcomes.push(o),
  });
  return { pipeline, inserted, outcomes };
}

describe('UtterancePipeline', () => {
  it('reads the app, cleans the text for it and inserts the result', async () => {
    const { pipeline, inserted, outcomes } = setup('Hello there.');
    await pipeline.deliver(segment('um hello there'));
    expect(inserted).toEqual(['Hello there.']);
    expect(outcomes[0]).toMatchObject({
      inserted: true,
      cleanup: { method: 'llm', tone: 'casual' },
    });
  });

  it('inserts nothing when cleanup leaves no text', async () => {
    const { pipeline, inserted, outcomes } = setup('unused');
    await pipeline.deliver(segment('um'));
    expect(inserted).toEqual([]);
    expect(outcomes[0]?.inserted).toBe(false);
  });
});
