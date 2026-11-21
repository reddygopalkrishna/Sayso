/** Pure scoring functions for the benchmark. No files, no network. */

/** Lowercase words with punctuation removed ("Hyderabad." → "hyderabad", "p.m." → "pm"). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Word error rate: (substitutions + deletions + insertions) / words in the reference. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = words(reference);
  const hyp = words(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const row = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = row;
  }
  return (previous[hyp.length] ?? 0) / ref.length;
}

/**
 * Which of the expected names appear in the text, spelled exactly (capital letters count:
 * "hyderabad" does not match "Hyderabad"). Whole words only.
 */
export function entitiesFound(entities: readonly string[], text: string): string[] {
  return entities.filter((entity) => {
    const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
  });
}

const FILLER_WORDS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'ah', 'hmm', 'mm']);

/** How many hesitation sounds are left in the text. */
export function fillerCount(text: string): number {
  return words(text).filter((w) => FILLER_WORDS.has(w)).length;
}

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;
