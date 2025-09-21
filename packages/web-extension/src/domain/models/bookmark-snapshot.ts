import type { Bookmark } from "./bookmark";
import type { CategorizedBookmark } from "./categorized-bookmark";

export interface BookmarkSnapshot {
  merged?: Bookmark[];
  categorized?: CategorizedBookmark[];
}

export const BOOKMARK_SNAPSHOT_STORAGE_KEY = "bookmarkSnapshot";
