import type { DictionaryTerm } from './dictionary.ts';

/**
 * Names people say all the time that speech-to-text gets wrong, with the usual mishearings.
 * Used with your own dictionary (your entries win when they overlap). Words that are also
 * ordinary English ("cloud", "cursor", "type script") are left out on purpose.
 */
const NAMES: ReadonlyArray<readonly [phrase: string, heardAs: readonly string[]]> = [
  [
    'ChatGPT',
    [
      'chat gpt',
      'chat g p t',
      'chat g pt',
      'chart gpt',
      'charge gpt',
      'chat gbt',
      'chatgbt',
      'chagpt',
      'chag pt',
      'chat jpt',
    ],
  ],
  ['OpenAI', ['open ai', 'open a i']],
  ['GitHub', ['git hub', 'get hub']],
  ['Gemini', []],
  ['Anthropic', []],
  ['Perplexity', []],
  ['Copilot', ['co pilot', 'co-pilot']],
  ['LinkedIn', ['linked in']],
  ['YouTube', ['you tube']],
  ['WhatsApp', ['whats app', "what's app"]],
  ['JavaScript', ['java script']],
  ['macOS', ['mac os']],
];

export const BUILT_IN_TERMS: readonly DictionaryTerm[] = NAMES.flatMap(([phrase, heardAs]) => [
  { phrase, spokenAs: null },
  ...heardAs.map((spokenAs) => ({ phrase, spokenAs })),
]);
