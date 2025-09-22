import { Bookmark } from "../models/bookmark";

export function normalizeBookmarkUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

export function mergeBookmarks(
  chromium: Bookmark[],
  firefox: Bookmark[]
): Bookmark[] {
  const merged = [...chromium];

  const seenUrls = new Set(
    chromium.map((bookmark) => normalizeBookmarkUrl(bookmark.url))
  );

  firefox.forEach((bookmark) => {
    const normalizedUrl = normalizeBookmarkUrl(bookmark.url);
    if (!seenUrls.has(normalizedUrl)) {
      merged.push(bookmark);
      seenUrls.add(normalizedUrl);
    }
  });

  return merged;
}
