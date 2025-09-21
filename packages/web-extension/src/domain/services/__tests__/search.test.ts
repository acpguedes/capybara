import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { searchBookmarks } from "../search";
import { BOOKMARK_SNAPSHOT_STORAGE_KEY } from "../../models/bookmark-snapshot";
import type { Bookmark } from "../../models/bookmark";
import type { CategorizedBookmark } from "../../models/categorized-bookmark";

type MockStorageArea = {
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type ExtensionNamespace = {
  storage: {
    local?: MockStorageArea;
    sync?: MockStorageArea;
  };
};

type ExtensionTestGlobals = typeof globalThis & {
  browser?: ExtensionNamespace;
  chrome?: ExtensionNamespace;
};

const extensionGlobals = globalThis as ExtensionTestGlobals;

afterEach(() => {
  delete extensionGlobals.browser;
  delete extensionGlobals.chrome;
  searchBookmarks.index([], []);
});

describe("searchBookmarks storage integration", () => {
  it("hydrates the search index from a stored snapshot", async () => {
    const merged: Bookmark[] = [
      {
        id: "merged-1",
        title: "Alpha",
        url: "https://alpha.test",
        tags: ["alpha"],
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ];

    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "reference"
      }
    ];

    extensionGlobals.browser = {
      storage: {
        local: {
          async get(key) {
            assert.strictEqual(key, BOOKMARK_SNAPSHOT_STORAGE_KEY);
            return {
              [BOOKMARK_SNAPSHOT_STORAGE_KEY]: {
                merged,
                categorized
              }
            };
          },
          async set() {
            throw new Error("unexpected write");
          }
        }
      }
    };

    await searchBookmarks.hydrateFromStorage();

    assert.deepStrictEqual(searchBookmarks.query(""), categorized);
  });

  it("persists merged and categorized snapshots to local and sync storage", async () => {
    const merged: Bookmark[] = [
      {
        id: "merged-1",
        title: "Alpha",
        url: "https://alpha.test",
        tags: ["alpha"],
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      {
        id: "merged-2",
        title: "Beta",
        url: "https://beta.test",
        tags: ["beta"],
        createdAt: "2024-01-02T00:00:00.000Z"
      }
    ];

    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "reference"
      },
      {
        ...merged[1],
        category: "articles"
      }
    ];

    const calls: Array<{ area: string; items: Record<string, unknown> }> = [];

    extensionGlobals.browser = {
      storage: {
        local: {
          async get() {
            return {};
          },
          async set(items) {
            calls.push({ area: "local", items });
          }
        },
        sync: {
          async get() {
            return {};
          },
          async set(items) {
            calls.push({ area: "sync", items });
          }
        }
      }
    };

    searchBookmarks.index(categorized, merged);

    await searchBookmarks.persistSnapshot();

    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls[0], {
      area: "local",
      items: {
        [BOOKMARK_SNAPSHOT_STORAGE_KEY]: {
          merged,
          categorized
        }
      }
    });
    assert.deepStrictEqual(calls[1], {
      area: "sync",
      items: {
        [BOOKMARK_SNAPSHOT_STORAGE_KEY]: {
          merged,
          categorized
        }
      }
    });
  });

  it("hydrates from sync storage when the local area is empty", async () => {
    const merged: Bookmark[] = [
      {
        id: "merged-3",
        title: "Gamma",
        url: "https://gamma.test",
        tags: ["gamma"],
        createdAt: "2024-01-03T00:00:00.000Z"
      }
    ];

    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "reading"
      }
    ];

    let localGetCount = 0;

    extensionGlobals.browser = {
      storage: {
        local: {
          async get() {
            localGetCount += 1;
            return {};
          },
          async set() {
            throw new Error("unexpected write");
          }
        },
        sync: {
          async get() {
            return {
              [BOOKMARK_SNAPSHOT_STORAGE_KEY]: {
                merged,
                categorized
              }
            };
          },
          async set() {
            throw new Error("unexpected write");
          }
        }
      }
    };

    await searchBookmarks.hydrateFromStorage();

    assert.strictEqual(localGetCount, 1);
    assert.deepStrictEqual(searchBookmarks.query(""), categorized);
  });
});
