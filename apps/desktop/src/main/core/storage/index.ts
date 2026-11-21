import { openDb, type Db } from './db.ts';
import { DictionaryRepo } from './DictionaryRepo.ts';
import { HistoryRepo } from './HistoryRepo.ts';
import { migrate } from './migrations.ts';
import { ResolverMemoryRepo } from './ResolverMemoryRepo.ts';

export interface Storage {
  db: Db;
  history: HistoryRepo;
  dictionary: DictionaryRepo;
  resolverMemory: ResolverMemoryRepo;
  close(): void;
}

export interface StorageOptions {
  /** How many history rows to keep (0 = history off). Read on every write. */
  historyKeep: () => number;
  now?: () => number;
}

/** Opens the local database, brings the schema up to date and returns the repositories. */
export function openStorage(path: string, options: StorageOptions): Storage {
  const db = openDb(path);
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  const now = options.now ?? Date.now;
  return {
    db,
    history: new HistoryRepo(db, { keep: options.historyKeep, now }),
    dictionary: new DictionaryRepo(db, now),
    resolverMemory: new ResolverMemoryRepo(db, now),
    close: () => db.close(),
  };
}
