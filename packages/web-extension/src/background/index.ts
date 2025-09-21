import { mergeBookmarks } from "../domain/services/merger";
import { categorizeBookmarks } from "../domain/services/categorizer";
import { searchBookmarks } from "../domain/services/search";
import { fetchChromiumBookmarks } from "./bookmark-sync/chromium-provider";
import { fetchFirefoxBookmarks } from "./bookmark-sync/firefox-provider";

export async function synchronizeBookmarks(): Promise<void> {
  const [chromiumBookmarks, firefoxBookmarks] = await Promise.all([
    fetchChromiumBookmarks(),
    fetchFirefoxBookmarks()
  ]);

  const merged = mergeBookmarks(chromiumBookmarks, firefoxBookmarks);
  const categorized = categorizeBookmarks(merged);
  searchBookmarks.index(categorized);
}
