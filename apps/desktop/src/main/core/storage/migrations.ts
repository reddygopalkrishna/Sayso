import type { Db } from './db.ts';

/**
 * Schema versions. The array index + 1 is the version stored in `PRAGMA user_version`. Never edit
 * a migration that has shipped: add a new one. Tables follow TECHNICAL_ARCHITECTURE §8.1 (without
 * the cloud `synced` columns) plus `app_name` on the history, for display.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE utterance_history (
    id            TEXT PRIMARY KEY,
    created_at    INTEGER NOT NULL,
    app_bundle_id TEXT,
    app_name      TEXT,
    mode          TEXT NOT NULL CHECK (mode IN ('dictation', 'command', 'smart_task')),
    raw_text      TEXT,
    final_text    TEXT,
    actions_json  TEXT,
    outcome       TEXT NOT NULL CHECK (outcome IN ('done', 'cancelled', 'blocked', 'failed')),
    latency_ms    INTEGER
  );
  CREATE INDEX utterance_history_created ON utterance_history (created_at DESC);

  CREATE TABLE dictionary_entry (
    id         TEXT PRIMARY KEY,
    phrase     TEXT NOT NULL,
    spoken_as  TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX dictionary_phrase ON dictionary_entry (phrase COLLATE NOCASE);

  CREATE TABLE resolver_memory (
    phrase      TEXT PRIMARY KEY,
    target_type TEXT NOT NULL CHECK (target_type IN ('app', 'url')),
    target      TEXT NOT NULL,
    browser     TEXT,
    updated_at  INTEGER NOT NULL
  );
  `,
];

export function schemaVersion(db: Db): number {
  return Number(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

/** Brings the database up to date. Each step is atomic. Refuses a database from a newer app. */
export function migrate(db: Db, migrations: readonly string[] = MIGRATIONS): void {
  const current = schemaVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `The Sayso database is version ${current}, newer than this app understands (${migrations.length}).`,
    );
  }
  for (let version = current; version < migrations.length; version++) {
    const sql = migrations[version];
    if (sql === undefined) continue;
    db.transaction(() => {
      db.exec(sql);
      // PRAGMA cannot take parameters; `version` is our own integer.
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
