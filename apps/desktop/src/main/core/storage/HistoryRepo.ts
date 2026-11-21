import { randomUUID } from 'node:crypto';
import type {
  HistoryAction,
  HistoryEntry,
  HistoryMode,
  HistoryOutcome,
} from '../../../shared/data.ts';
import type { Db } from './db.ts';

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'createdAt'>;

interface Row {
  id: string;
  created_at: number;
  app_bundle_id: string | null;
  app_name: string | null;
  mode: string;
  raw_text: string | null;
  final_text: string | null;
  actions_json: string | null;
  outcome: string;
  latency_ms: number | null;
}

function parseAction(json: string | null): HistoryAction | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as HistoryAction;
  } catch {
    return null;
  }
}

function toEntry(row: Row): HistoryEntry {
  return {
    id: row.id,
    createdAt: Number(row.created_at),
    appBundleId: row.app_bundle_id,
    appName: row.app_name,
    mode: row.mode as HistoryMode,
    rawText: row.raw_text,
    finalText: row.final_text,
    action: parseAction(row.actions_json),
    outcome: row.outcome as HistoryOutcome,
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
  };
}

export interface HistoryOptions {
  /** Rows to keep (PRD: the last 50). 0 turns history off: nothing is stored. */
  keep: () => number;
  now?: () => number;
}

/** What was said and what Sayso did, stored on this Mac only. Old rows are pruned on every write. */
export class HistoryRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly opts: HistoryOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  record(entry: NewHistoryEntry): HistoryEntry | null {
    const keep = this.opts.keep();
    if (keep <= 0) return null;
    const saved: HistoryEntry = { ...entry, id: randomUUID(), createdAt: this.now() };
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO utterance_history
           (id, created_at, app_bundle_id, app_name, mode, raw_text, final_text, actions_json, outcome, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        saved.id,
        saved.createdAt,
        saved.appBundleId,
        saved.appName,
        saved.mode,
        saved.rawText,
        saved.finalText,
        saved.action ? JSON.stringify(saved.action) : null,
        saved.outcome,
        saved.latencyMs === null ? null : Math.round(saved.latencyMs),
      );
      this.prune(keep);
    });
    return saved;
  }

  /** Newest first. */
  recent(limit = 50): HistoryEntry[] {
    return this.db
      .all<Row>(
        'SELECT * FROM utterance_history ORDER BY created_at DESC, rowid DESC LIMIT ?',
        limit,
      )
      .map(toEntry);
  }

  count(): number {
    return Number(
      this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM utterance_history')?.n ?? 0,
    );
  }

  /** Deletes everything; the user can do this at any time. */
  clear(): void {
    this.db.run('DELETE FROM utterance_history');
  }

  private prune(keep: number): void {
    this.db.run(
      `DELETE FROM utterance_history WHERE rowid NOT IN
         (SELECT rowid FROM utterance_history ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      keep,
    );
  }
}
