import type { Bookmark } from "../models/bookmark";
import type { CategorizedBookmark } from "../models/categorized-bookmark";
import {
  BOOKMARK_SNAPSHOT_STORAGE_KEY,
  type BookmarkSnapshot,
  type BookmarkSnapshotStorageValue
} from "../models/bookmark-snapshot";
import { loadSyncSettings as defaultLoadSyncSettings } from "./sync-settings";
import { getItem, setItem } from "./extension-storage";
import {
  decryptBookmarkSnapshot,
  encryptBookmarkSnapshot,
  type BookmarkSnapshotEncryptionContext
} from "./bookmark-snapshot-crypto";

type SyncSettingsLoader = typeof defaultLoadSyncSettings;

let loadSyncSettings: SyncSettingsLoader = defaultLoadSyncSettings;

export function setSearchSyncSettingsLoader(
  loader: SyncSettingsLoader
): void {
  loadSyncSettings = loader;
}

export function resetSearchSyncSettingsLoader(): void {
  loadSyncSettings = defaultLoadSyncSettings;
}

class SearchIndex {
  private items: CategorizedBookmark[] = [];
  private merged: Bookmark[] = [];

  public index(bookmarks: CategorizedBookmark[], merged: Bookmark[] = []): void {
    this.items = [...bookmarks];
    this.merged = [...merged];
  }

  public query(term: string): CategorizedBookmark[] {
    const normalizedTerm = term.toLowerCase();
    return this.items.filter((bookmark) => {
      return (
        bookmark.title.toLowerCase().includes(normalizedTerm) ||
        bookmark.url.toLowerCase().includes(normalizedTerm) ||
        bookmark.category.toLowerCase().includes(normalizedTerm)
      );
    });
  }

  public getMergedSnapshot(): Bookmark[] {
    return [...this.merged];
  }

  private serialize(): BookmarkSnapshot {
    return {
      merged: [...this.merged],
      categorized: [...this.items]
    };
  }

  private deserialize(snapshot: BookmarkSnapshot | null): void {
    if (!snapshot) {
      this.items = [];
      this.merged = [];
      return;
    }

    this.items = Array.isArray(snapshot.categorized)
      ? [...snapshot.categorized]
      : [];

    this.merged = Array.isArray(snapshot.merged)
      ? [...snapshot.merged]
      : [];
  }

  public async hydrateFromStorage(): Promise<void> {
    let settings: { enabled: boolean; secret?: string };

    try {
      settings = await loadSyncSettings();
    } catch (error) {
      console.error("Failed to load synchronization settings", error);
      settings = { enabled: false };
    }

    const context = this.resolveEncryptionContext(settings.enabled, settings.secret);

    const storageValue = await getItem(BOOKMARK_SNAPSHOT_STORAGE_KEY, {
      area: settings.enabled ? ["local", "sync"] : ["local"]
    });

    if (!storageValue) {
      this.deserialize(null);
      return;
    }

    try {
      const snapshot = await decryptBookmarkSnapshot(storageValue, context);
      this.deserialize(snapshot);
    } catch (error) {
      console.error("Failed to decrypt bookmark snapshot", error);
      this.deserialize(null);
    }
  }

  public async persistSnapshot(): Promise<void> {
    const snapshot = this.serialize();
    let settings: { enabled: boolean; secret?: string };

    try {
      settings = await loadSyncSettings();
    } catch (error) {
      console.error("Failed to load synchronization settings", error);
      settings = { enabled: false };
    }
    const context = this.resolveEncryptionContext(settings.enabled, settings.secret);

    let storageValue: BookmarkSnapshotStorageValue;

    if (context) {
      storageValue = await encryptBookmarkSnapshot(snapshot, context);
    } else {
      storageValue = { version: 1, kind: "plain", snapshot };
    }

    await setItem(BOOKMARK_SNAPSHOT_STORAGE_KEY, storageValue, { area: "local" });

    if (settings.enabled) {
      await setItem(BOOKMARK_SNAPSHOT_STORAGE_KEY, storageValue, {
        area: "sync"
      });
    }
  }

  private resolveEncryptionContext(
    enabled: boolean,
    secret: string | undefined
  ): BookmarkSnapshotEncryptionContext | null {
    if (!enabled) {
      return null;
    }

    if (secret && secret.trim().length > 0) {
      return { keySource: "user", secret: secret.trim() };
    }

    return { keySource: "platform" };
  }
}

export const searchBookmarks = new SearchIndex();
