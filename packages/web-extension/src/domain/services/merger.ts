import { Bookmark } from "../models/bookmark";

export function mergeBookmarks(
  chromium: Bookmark[],
  firefox: Bookmark[]
): Bookmark[] {
  const merged = [...chromium];

  const chromiumIds = new Set(chromium.map((bookmark) => bookmark.id));
  firefox.forEach((bookmark) => {
    if (!chromiumIds.has(bookmark.id)) {
      merged.push(bookmark);
    }
  });

  return merged;
}
