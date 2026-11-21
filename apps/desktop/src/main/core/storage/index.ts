import { openDb, type Db } from './db.ts';
import { ProfileRepo } from './ProfileRepo.ts';
import { AppStyleRepo } from './AppStyleRepo.ts';
import { DictionaryRepo } from './DictionaryRepo.ts';
import { HistoryRepo } from './HistoryRepo.ts';
import { migrate } from './migrations.ts';
import { ResolverMemoryRepo } from './ResolverMemoryRepo.ts';
import { SettingsRepo } from './SettingsRepo.ts';
import { SnippetRepo } from './SnippetRepo.ts';

export interface Storage {
  db: Db;
  history: HistoryRepo;
  dictionary: DictionaryRepo;
  resolverMemory: ResolverMemoryRepo;
  snippets: SnippetRepo;
  settings: SettingsRepo;
  appStyles: AppStyleRepo;
  profile: ProfileRepo;
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
    snippets: new SnippetRepo(db, now),
    settings: new SettingsRepo(db, now),
    appStyles: new AppStyleRepo(db, now),
    profile: new ProfileRepo(db, now),
    close: () => db.close(),
  };
}
