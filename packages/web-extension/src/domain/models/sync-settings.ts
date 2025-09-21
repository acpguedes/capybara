export type SyncKeySource = "user" | "platform";

export interface SyncSettings {
  enabled: boolean;
  /**
   * When set, bookmarks are encrypted using a key derived from the provided secret.
   * If empty, platform derived entropy is used instead.
   */
  secret?: string;
  keySource: SyncKeySource;
}

export const SYNC_SETTINGS_STORAGE_KEY = "syncSettings";

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  enabled: false,
  keySource: "platform"
};
