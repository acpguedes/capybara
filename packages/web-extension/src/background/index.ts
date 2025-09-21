import { mergeBookmarks } from "../domain/services/merger";
import { categorizeBookmarksWithLLM } from "../domain/services/llm-categorizer";
import { searchBookmarks } from "../domain/services/search";
import { fetchChromiumBookmarks } from "./bookmark-sync/chromium-provider";
import { fetchFirefoxBookmarks } from "./bookmark-sync/firefox-provider";

export async function synchronizeBookmarks(): Promise<void> {
  const [chromiumBookmarks, firefoxBookmarks] = await Promise.all([
    fetchChromiumBookmarks(),
    fetchFirefoxBookmarks()
  ]);

  const merged = mergeBookmarks(chromiumBookmarks, firefoxBookmarks);
  const categorized = await categorizeBookmarksWithLLM(merged);
  searchBookmarks.index(categorized);
}
