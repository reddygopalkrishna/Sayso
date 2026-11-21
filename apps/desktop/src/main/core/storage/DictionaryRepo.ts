import { randomUUID } from 'node:crypto';
import type { DictionaryEntry } from '../../../shared/data.ts';
import type { Db } from './db.ts';

interface Row {
  id: string;
  phrase: string;
  spoken_as: string | null;
  updated_at: number;
}

const MAX_LENGTH = 100;
/** Keeps the cleanup prompt small. */
export const MAX_ENTRIES = 500;

export class DictionaryError extends Error {}

function toEntry(row: Row): DictionaryEntry {
  return {
    id: row.id,
    phrase: row.phrase,
    spokenAs: row.spoken_as,
    updatedAt: Number(row.updated_at),
  };
}

/** Collapses whitespace and rejects empty, oversized or control-character input. */
function clean(text: string, what: string): string {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length > MAX_LENGTH)
    throw new DictionaryError(`${what} is longer than ${MAX_LENGTH} characters.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value))
    throw new DictionaryError(`${what} has invalid characters.`);
  return value;
}

/** Names and terms to spell correctly, with an optional "heard as" for words Whisper mishears. */
export class DictionaryRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** Adds a term, or updates the "heard as" of an existing one (matched ignoring case). */
  upsert(phrase: string, spokenAs: string | null = null): DictionaryEntry {
    const p = clean(phrase, 'The word');
    if (p === '') throw new DictionaryError('Type the word or name to add.');
    const heard = spokenAs === null ? '' : clean(spokenAs, '"Heard as"');
    if (heard.toLowerCase() === p.toLowerCase()) {
      throw new DictionaryError('"Heard as" is the same as the word; leave it empty.');
    }
    const existing = this.db.get<Row>(
      'SELECT * FROM dictionary_entry WHERE phrase = ? COLLATE NOCASE',
      p,
    );
    const at = this.now();
    if (existing) {
      this.db.run(
        'UPDATE dictionary_entry SET phrase = ?, spoken_as = ?, updated_at = ? WHERE id = ?',
        p,
        heard || null,
        at,
        existing.id,
      );
      return { id: existing.id, phrase: p, spokenAs: heard || null, updatedAt: at };
    }
    if (this.count() >= MAX_ENTRIES) {
      throw new DictionaryError(
        `The dictionary is full (${MAX_ENTRIES} entries). Remove some first.`,
      );
    }
    const entry: DictionaryEntry = {
      id: randomUUID(),
      phrase: p,
      spokenAs: heard || null,
      updatedAt: at,
    };
    this.db.run(
      'INSERT INTO dictionary_entry (id, phrase, spoken_as, updated_at) VALUES (?, ?, ?, ?)',
      entry.id,
      entry.phrase,
      entry.spokenAs,
      entry.updatedAt,
    );
    return entry;
  }

  list(): DictionaryEntry[] {
    return this.db
      .all<Row>('SELECT * FROM dictionary_entry ORDER BY phrase COLLATE NOCASE')
      .map(toEntry);
  }

  remove(id: string): boolean {
    return this.db.run('DELETE FROM dictionary_entry WHERE id = ?', id) > 0;
  }

  count(): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM dictionary_entry')?.n ?? 0);
  }
}
