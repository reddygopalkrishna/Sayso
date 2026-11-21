import { randomUUID } from 'node:crypto';
import type { Snippet } from '../../../shared/data.ts';
import { DictionaryError } from './DictionaryRepo.ts';
import type { Db } from './db.ts';

interface Row {
  id: string;
  spoken_trigger: string;
  trigger_key: string;
  body: string;
  updated_at: number;
}

const MAX_TRIGGER = 60;
const MAX_BODY = 2_000;
export const MAX_SNIPPETS = 200;

/** Shown to the person as is (it extends DictionaryError, which the IPC layer passes through). */
export class SnippetError extends DictionaryError {}

/** How a trigger and a spoken phrase are compared: letters and digits only, lowercase. */
export function normalizeTrigger(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSnippet(row: Row): Snippet {
  return {
    id: row.id,
    trigger: row.spoken_trigger,
    body: row.body,
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Short spoken triggers that type a longer text ("calendly" → your booking link). The text is
 * typed exactly as saved: no AI, no cleanup. A trigger is matched on the whole phrase only.
 */
export class SnippetRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** Adds a snippet, or replaces the text of the one with the same trigger (ignoring case). */
  upsert(trigger: string, body: string): Snippet {
    const spoken = trigger.replace(/\s+/g, ' ').trim();
    const key = normalizeTrigger(spoken);
    if (key === '') throw new SnippetError('Type the words you will say.');
    if (spoken.length > MAX_TRIGGER) {
      throw new SnippetError(`The trigger is longer than ${MAX_TRIGGER} characters.`);
    }
    if (body.trim() === '') throw new SnippetError('Type the text to insert.');
    if (body.length > MAX_BODY) {
      throw new SnippetError(`The text is longer than ${MAX_BODY} characters.`);
    }
    // Line breaks and tabs are fine in the text; other control characters are not.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) {
      throw new SnippetError('The text has invalid characters.');
    }

    const at = this.now();
    const existing = this.db.get<Row>('SELECT * FROM snippet WHERE trigger_key = ?', key);
    if (existing) {
      this.db.run(
        'UPDATE snippet SET spoken_trigger = ?, body = ?, updated_at = ? WHERE id = ?',
        spoken,
        body,
        at,
        existing.id,
      );
      return { id: existing.id, trigger: spoken, body, updatedAt: at };
    }
    if (this.count() >= MAX_SNIPPETS) {
      throw new SnippetError(`There are ${MAX_SNIPPETS} snippets already. Remove some first.`);
    }
    const snippet: Snippet = { id: randomUUID(), trigger: spoken, body, updatedAt: at };
    this.db.run(
      'INSERT INTO snippet (id, spoken_trigger, trigger_key, body, updated_at) VALUES (?, ?, ?, ?, ?)',
      snippet.id,
      snippet.trigger,
      key,
      snippet.body,
      snippet.updatedAt,
    );
    return snippet;
  }

  list(): Snippet[] {
    return this.db.all<Row>('SELECT * FROM snippet ORDER BY trigger_key').map(toSnippet);
  }

  remove(id: string): boolean {
    return this.db.run('DELETE FROM snippet WHERE id = ?', id) > 0;
  }

  /** The text for what was said, if the whole phrase is a trigger; otherwise null. */
  find(spoken: string): string | null {
    const key = normalizeTrigger(spoken);
    if (key === '') return null;
    return this.db.get<Row>('SELECT * FROM snippet WHERE trigger_key = ?', key)?.body ?? null;
  }

  count(): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM snippet')?.n ?? 0);
  }
}
