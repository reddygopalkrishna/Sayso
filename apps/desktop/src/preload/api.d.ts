import type { DictionaryEntry, HistoryEntry, OpenChoice } from '../shared/data.ts';
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
