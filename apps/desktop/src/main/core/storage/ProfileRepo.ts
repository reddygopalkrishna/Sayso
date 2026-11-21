import {
  PROFILE_FIELDS,
  PROFILE_KEYS,
  type ProfileKey,
  type ProfilePatch,
  type ProfileValues,
} from '../../../shared/profile.ts';
import { DictionaryError } from './DictionaryRepo.ts';
import { normalizeTrigger } from './SnippetRepo.ts';
import type { Db } from './db.ts';

interface Row {
  key: string;
  value: string;
}

/** Shown to the person as is (the IPC layer passes DictionaryError messages through). */
export class ProfileError extends DictionaryError {}

/** The spoken ways to ask for a field, each normalized the way a spoken phrase is. */
const BY_PHRASE: ReadonlyMap<string, ProfileKey> = new Map(
  PROFILE_FIELDS.flatMap((f) => f.phrases.map((p) => [normalizeTrigger(p), f.key] as const)),
);

/** Facts about you ("my email", "my address"), kept on this Mac and typed when you ask. */
export class ProfileRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** Everything saved, by key. */
  all(): ProfileValues {
    const out: ProfileValues = {};
    for (const row of this.db.all<Row>('SELECT key, value FROM profile')) {
      if ((PROFILE_KEYS as string[]).includes(row.key)) out[row.key as ProfileKey] = row.value;
    }
    return out;
  }

  /** Sets the given fields; an empty value clears one. Other fields are left as they are. */
  set(patch: ProfilePatch): void {
    const at = this.now();
    for (const [key, raw] of Object.entries(patch)) {
      if (!(PROFILE_KEYS as string[]).includes(key) || raw === undefined) continue;
      const value = key === 'address' ? raw.trim() : raw.replace(/\s+/g, ' ').trim();
      // Line breaks only in an address; no other control characters anywhere.
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        throw new ProfileError('That has characters Sayso cannot type.');
      }
      if (value === '') {
        this.db.run('DELETE FROM profile WHERE key = ?', key);
        continue;
      }
      this.db.run(
        'INSERT INTO profile (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        key,
        value,
        at,
      );
    }
  }

  /** The value for what was said ("my email" → the saved email), or null (also when it is not saved). */
  find(spoken: string): string | null {
    const key = BY_PHRASE.get(normalizeTrigger(spoken));
    if (!key) return null;
    return this.db.get<Row>('SELECT key, value FROM profile WHERE key = ?', key)?.value ?? null;
  }
}
