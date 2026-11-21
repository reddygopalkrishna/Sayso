import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type SqlParam = SQLInputValue;

/**
 * The only way the rest of the app touches SQLite. It wraps Node's built-in `node:sqlite`
 * (the same SQLite in Electron's Node and in the test runner, nothing to compile). Swapping to
 * better-sqlite3 later means rewriting this one file.
 */
export interface Db {
  /** Runs one statement; returns the number of rows changed. */
  run(sql: string, ...params: SqlParam[]): number;
  get<T>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T>(sql: string, ...params: SqlParam[]): T[];
  /** Runs several statements without parameters (schema changes). */
  exec(sql: string): void;
  /** All or nothing: rolls back if `fn` throws. */
  transaction<T>(fn: () => T): T;
  close(): void;
}

class NodeSqliteDb implements Db {
  private depth = 0;

  constructor(private readonly db: DatabaseSync) {}

  run(sql: string, ...params: SqlParam[]): number {
    return Number(this.db.prepare(sql).run(...params).changes);
  }

  get<T>(sql: string, ...params: SqlParam[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SqlParam[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    // Nested calls join the outer transaction.
    if (this.depth > 0) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth = 0;
    }
  }

  close(): void {
    this.db.close();
  }
}

/** Opens (creating if needed) a database file, or `:memory:`. The file is private to the user. */
export function openDb(path: string): Db {
  const inMemory = path === ':memory:';
  if (!inMemory) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (!inMemory) {
    // History holds what was said: keep it readable by this user only (SQLite gives its -wal and
    // -shm files the same mode).
    chmodSync(path, 0o600);
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  return new NodeSqliteDb(db);
}
