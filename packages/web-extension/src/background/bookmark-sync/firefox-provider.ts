import { Bookmark } from "../../domain/models/bookmark";
import { BookmarkTreeNode, flattenBookmarkTree } from "./bookmark-tree";

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
};

export async function fetchFirefoxBookmarks(): Promise<Bookmark[]> {
  const globalObject = globalThis as GlobalWithWebExtensionAPIs;

  if (globalObject.browser?.bookmarks?.getTree) {
    const tree = await globalObject.browser.bookmarks.getTree();
    return flattenBookmarkTree(tree);
  }

  const chromeNamespace = globalObject.chrome;
  const chromeBookmarks = chromeNamespace?.bookmarks;

  if (chromeBookmarks?.getTree) {
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

    return flattenBookmarkTree(tree);
  }

  return [];
}
