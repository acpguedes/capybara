import { Bookmark } from "../models/bookmark";
import type { CategorizedBookmark } from "../models/categorized-bookmark";

export function categorizeBookmarks(bookmarks: Bookmark[]): CategorizedBookmark[] {
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    category: deriveCategory(bookmark)
  }));
}

function deriveCategory(bookmark: Bookmark): string {
  if (bookmark.tags.length > 0) {
    return bookmark.tags[0];
  }

  try {
    const host = new URL(bookmark.url).hostname;
    return host.split(".").slice(-2).join(".");
  } catch (error) {
    return "uncategorized";
  }
}
