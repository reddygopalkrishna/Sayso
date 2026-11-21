import type { AppStyle } from '../../../shared/data.ts';
import type { Style } from '../../../shared/settings.ts';
import { DictionaryError } from './DictionaryRepo.ts';
import type { Db } from './db.ts';

interface Row {
  bundle_id: string;
  app_name: string | null;
  style: Style | null;
}

/** Shown to the person as is (the IPC layer passes DictionaryError messages through). */
export class AppStyleError extends DictionaryError {}

/** A style picked for one app (by its bundle id), shown next to the apps you have dictated into. */
export class AppStyleRepo {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** The style chosen for this app, or null to use the everywhere style. */
  get(bundleId: string | null): Style | null {
    if (!bundleId) return null;
    return this.db.get<Row>('SELECT * FROM app_style WHERE bundle_id = ?', bundleId)?.style ?? null;
  }

  /** Sets an app's style; null removes it, so the app follows the everywhere style again. */
  set(bundleId: string, appName: string | null, style: Style | null): void {
    if (bundleId.trim() === '' || bundleId.length > 200) {
      throw new AppStyleError('That app is not valid.');
    }
    if (style === null) {
      this.db.run('DELETE FROM app_style WHERE bundle_id = ?', bundleId);
      return;
    }
    this.db.run(
      `INSERT INTO app_style (bundle_id, app_name, style, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(bundle_id) DO UPDATE SET style = excluded.style, updated_at = excluded.updated_at,
         app_name = COALESCE(excluded.app_name, app_name)`,
      bundleId,
      appName,
      style,
      this.now(),
    );
  }

  /** Every app you have dictated into or given a style, with its own style (null = follows the default). */
  list(): AppStyle[] {
    const rows = this.db.all<Row>(
      `SELECT bundle_id, MAX(app_name) AS app_name, MAX(style) AS style FROM (
         SELECT app_bundle_id AS bundle_id, app_name, NULL AS style
           FROM utterance_history WHERE app_bundle_id IS NOT NULL
         UNION ALL
         SELECT bundle_id, app_name, style FROM app_style
       ) GROUP BY bundle_id ORDER BY LOWER(COALESCE(MAX(app_name), bundle_id))`,
    );
    return rows.map((row) => ({
      bundleId: row.bundle_id,
      appName: row.app_name,
      style: row.style,
    }));
  }
}
