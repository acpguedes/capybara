import type { Bookmark } from "../models/bookmark";
import type { CategorizedBookmark } from "../models/categorized-bookmark";
import {
  BOOKMARK_SNAPSHOT_STORAGE_KEY,
  type BookmarkSnapshot
} from "../models/bookmark-snapshot";
import { getItem, setItem } from "./extension-storage";

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
    const snapshot = await getItem(BOOKMARK_SNAPSHOT_STORAGE_KEY, {
      area: ["local", "sync"]
    });

    this.deserialize(snapshot);
  }

  public async persistSnapshot(): Promise<void> {
    const snapshot = this.serialize();

    await setItem(BOOKMARK_SNAPSHOT_STORAGE_KEY, snapshot, {
      area: ["local", "sync"]
    });
  }
}

export const searchBookmarks = new SearchIndex();
