import { SettingsPatchSchema, type SettingsPatch } from '../../../shared/settings.ts';
import type { Db } from './db.ts';

interface Row {
  key: string;
  value: string;
}

/**
 * Settings changed in the app, kept as key → JSON value. They win over `.env` (which only sets the
 * starting values). A stored value that no longer passes the limits is ignored, never applied.
 */
export class SettingsRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** The stored overrides, each one checked against the limits. */
  get(): SettingsPatch {
    const out: Record<string, unknown> = {};
    for (const row of this.db.all<Row>('SELECT key, value FROM setting')) {
      try {
        const one = SettingsPatchSchema.safeParse({ [row.key]: JSON.parse(row.value) });
        if (one.success) Object.assign(out, one.data);
      } catch {
        // A damaged row is skipped; the default stays in force.
      }
    }
    return out as SettingsPatch;
  }

  /** Saves the given settings. The patch must already have passed SettingsPatchSchema. */
  set(patch: SettingsPatch): void {
    const at = this.now();
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        this.db.run(
          'INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          key,
          JSON.stringify(value),
          at,
        );
      }
    });
  }

  /** Back to the starting values (`.env` or built-in). */
  reset(): void {
    this.db.run('DELETE FROM setting');
  }
}
