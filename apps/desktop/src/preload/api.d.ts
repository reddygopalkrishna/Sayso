import type {
  AppStyle,
  DictionaryEntry,
  HistoryEntry,
  OpenChoice,
  Snippet,
} from '../shared/data.ts';
import type { SettingsPatch, Style, UserSettings } from '../shared/settings.ts';
import type { AppStatus, SettingsPane } from '../shared/status.ts';

/** The only surface the renderer can reach (window.sayso). Every call rejects with a plain message. */
export interface SaysoApi {
  getStatus(): Promise<AppStatus>;
  onStatus(callback: (status: AppStatus) => void): () => void;
  history: {
    list(): Promise<HistoryEntry[]>;
    clear(): Promise<void>;
  };
  dictionary: {
    list(): Promise<DictionaryEntry[]>;
    add(phrase: string, spokenAs: string | null): Promise<DictionaryEntry>;
    remove(id: string): Promise<void>;
  };
  handsFree: {
    /** Turns hands-free on or off; rejects with a plain message when it cannot start. */
    set(on: boolean): Promise<void>;
  };
  appStyles: {
    list(): Promise<AppStyle[]>;
    /** Sets one app's style (null: follow the everywhere style); answers the updated list. */
    set(bundleId: string, appName: string | null, style: Style | null): Promise<AppStyle[]>;
  };
  settings: {
    get(): Promise<UserSettings>;
    set(patch: SettingsPatch): Promise<UserSettings>;
    reset(): Promise<UserSettings>;
  };
  snippets: {
    list(): Promise<Snippet[]>;
    add(trigger: string, body: string): Promise<Snippet>;
    remove(id: string): Promise<void>;
  };
  openChoices: {
    list(): Promise<OpenChoice[]>;
    remove(phrase: string): Promise<void>;
  };
  permissions: {
    request(kind: 'microphone' | 'accessibility'): Promise<void>;
    openSettings(pane: SettingsPane): Promise<void>;
  };
}

declare global {
  interface Window {
    sayso: SaysoApi;
  }
}
