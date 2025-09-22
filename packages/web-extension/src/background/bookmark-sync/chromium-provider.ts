import { BookmarkTreeNode, flattenBookmarkTree } from "./bookmark-tree";
import { isFirefoxEnvironment } from "./environment";
import type { BookmarkProviderResult } from "./provider-result";

type BrowserNamespace = {
  bookmarks?: {
    getTree: () => Promise<BookmarkTreeNode[]>;
  };
};

type ChromeNamespace = {
  bookmarks?: {
    getTree(callback: (nodes: BookmarkTreeNode[]) => void): void;
  };
  runtime?: {
    lastError?: { message?: string };
  };
};

type GlobalWithWebExtensionAPIs = typeof globalThis & {
  browser?: BrowserNamespace;
  chrome?: ChromeNamespace;
  navigator?: Navigator;
};

export async function fetchChromiumBookmarks(): Promise<BookmarkProviderResult> {
  const globalObject = globalThis as GlobalWithWebExtensionAPIs;

  if (isFirefoxEnvironment(globalObject)) {
    return { bookmarks: [], availability: "unavailable" };
  }

  if (globalObject.browser?.bookmarks?.getTree) {
    try {
      const tree = await globalObject.browser.bookmarks.getTree();
      return {
        bookmarks: flattenBookmarkTree(tree, "chromium"),
        availability: "success"
      };
    } catch (error) {
      return { bookmarks: [], availability: "unavailable" };
    }
  }

  const chromeNamespace = globalObject.chrome;
  const chromeBookmarks = chromeNamespace?.bookmarks;

  if (chromeBookmarks?.getTree) {
    try {
      const tree = await new Promise<BookmarkTreeNode[]>((resolve, reject) => {
        try {
          chromeBookmarks.getTree((nodes) => {
            const errorMessage = chromeNamespace?.runtime?.lastError?.message;
            if (errorMessage) {
              reject(new Error(errorMessage));
              return;
            }

            resolve(nodes);
          });
        } catch (error) {
          reject(error);
        }
      });

      return {
        bookmarks: flattenBookmarkTree(tree, "chromium"),
        availability: "success"
      };
    } catch (error) {
      return { bookmarks: [], availability: "unavailable" };
    }
  }

  return { bookmarks: [], availability: "unavailable" };
}
