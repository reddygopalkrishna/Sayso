import type { OpenChoice } from '../../../shared/data.ts';
import type { Db } from './db.ts';

interface Row {
  phrase: string;
  target_type: string;
  target: string;
  updated_at: number;
}

/** Lowercase words only, so "GitHub" and "github." are the same phrase. */
export function memoryKey(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toChoice(row: Row): OpenChoice {
  return {
    phrase: row.phrase,
    targetType: row.target_type === 'app' ? 'app' : 'url',
    target: row.target,
    updatedAt: Number(row.updated_at),
  };
}

/** What "open X" meant last time (PRD §7.5), so the same words open the same thing. */
export class ResolverMemoryRepo {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  get(phrase: string): OpenChoice | null {
    const row = this.db.get<Row>(
      'SELECT * FROM resolver_memory WHERE phrase = ?',
      memoryKey(phrase),
    );
    return row ? toChoice(row) : null;
  }

  set(phrase: string, targetType: 'app' | 'url', target: string): void {
    const key = memoryKey(phrase);
    if (key === '' || target === '') return;
    this.db.run(
      `INSERT INTO resolver_memory (phrase, target_type, target, browser, updated_at)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(phrase) DO UPDATE SET target_type = excluded.target_type,
         target = excluded.target, updated_at = excluded.updated_at`,
      key,
      targetType,
      target,
      this.now(),
    );
  }

  list(): OpenChoice[] {
    return this.db.all<Row>('SELECT * FROM resolver_memory ORDER BY phrase').map(toChoice);
  }

  remove(phrase: string): boolean {
    return this.db.run('DELETE FROM resolver_memory WHERE phrase = ?', memoryKey(phrase)) > 0;
  }
}
