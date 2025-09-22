import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARK_SYNC_ALARM_NAME,
  BOOKMARK_SYNC_ALARM_PERIOD_MINUTES,
  bootstrapBackground,
  registerBackgroundListeners,
  resetSynchronizeBookmarksDependencies,
  setSynchronizeBookmarksDependencies,
  synchronizeBookmarks
} from "../index";
import {
  resetSearchSyncSettingsLoader,
  searchBookmarks,
  setSearchSyncSettingsLoader
} from "../../domain/services/search";
import { BOOKMARK_SNAPSHOT_STORAGE_KEY } from "../../domain/models/bookmark-snapshot";
import type { Bookmark } from "../../domain/models/bookmark";
import type { CategorizedBookmark } from "../../domain/models/categorized-bookmark";
import type { SyncSettings } from "../../domain/models/sync-settings";
import { RUNTIME_SYNC_NOW_MESSAGE_TYPE } from "../../shared/runtime-messages";
import type { BookmarkProviderAvailability } from "../bookmark-sync/provider-result";
function stubSyncSettings(settings: SyncSettings): void {
  setSearchSyncSettingsLoader(async () => settings);
}

function stubSynchronizationPipeline(options: {
  chromium: Bookmark[];
  firefox: Bookmark[];
  merged: Bookmark[];
  categorized: CategorizedBookmark[];
  chromiumAvailability?: BookmarkProviderAvailability;
  firefoxAvailability?: BookmarkProviderAvailability;
}): () => void {
  setSynchronizeBookmarksDependencies({
    fetchChromiumBookmarks: async () => ({
      bookmarks: options.chromium,
      availability: options.chromiumAvailability ?? "success"
    }),
    fetchFirefoxBookmarks: async () => ({
      bookmarks: options.firefox,
      availability: options.firefoxAvailability ?? "success"
    }),
    mergeBookmarks: () => options.merged,
    categorizeBookmarksWithLLM: async () => options.categorized
  });

  return () => {
    resetSynchronizeBookmarksDependencies();
  };
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

afterEach(() => {
  searchBookmarks.index([], []);
  resetSearchSyncSettingsLoader();
  resetSynchronizeBookmarksDependencies();
});

describe("registerBackgroundListeners", () => {
  it("invokes the synchronizer when runtime events fire", async () => {
    let installedListener: ((...args: unknown[]) => void) | undefined;
    let startupListener: ((...args: unknown[]) => void) | undefined;

    const runtime = {
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          installedListener = listener;
        }
      },
      onStartup: {
        addListener: (listener: (...args: unknown[]) => void) => {
          startupListener = listener;
        }
      }
    };

    let callCount = 0;
    const synchronizer = () => {
      callCount += 1;
      return Promise.resolve();
    };

    registerBackgroundListeners({ runtime }, synchronizer);

    assert.ok(installedListener);
    assert.ok(startupListener);

    installedListener?.();
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    startupListener?.();
    await Promise.resolve();
    assert.strictEqual(callCount, 2);
  });

  it("invokes the synchronizer when receiving a manual synchronization request", async () => {
    let messageListener:
      | ((
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => void)
      | undefined;

    const runtime = {
      onMessage: {
        addListener: (
          listener: (
            message: unknown,
            sender: unknown,
            sendResponse: (response?: unknown) => void
          ) => void
        ) => {
          messageListener = listener;
        }
      }
    };

    let callCount = 0;
    const synchronizer = () => {
      callCount += 1;
      return Promise.resolve();
    };

    registerBackgroundListeners({ runtime }, synchronizer);

    assert.ok(messageListener);

    messageListener?.({ type: RUNTIME_SYNC_NOW_MESSAGE_TYPE }, {}, () => {});
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    messageListener?.({ type: "something-else" }, {}, () => {});
    await Promise.resolve();
    assert.strictEqual(callCount, 1);
  });

  it("schedules and reacts to periodic alarms", async () => {
    let alarmListener: ((alarm?: { name?: string }) => void) | undefined;
    let createdAlarmName: string | undefined;
    let createdAlarmPeriod: number | undefined;

    const alarms = {
      create: (name: string, info: { periodInMinutes: number }) => {
        createdAlarmName = name;
        createdAlarmPeriod = info.periodInMinutes;
      },
      onAlarm: {
        addListener: (listener: (alarm?: { name?: string }) => void) => {
          alarmListener = listener;
        }
      }
    };

    let callCount = 0;
    const synchronizer = () => {
      callCount += 1;
      return Promise.resolve();
    };

    registerBackgroundListeners({ alarms }, synchronizer);

    assert.strictEqual(createdAlarmName, BOOKMARK_SYNC_ALARM_NAME);
    assert.strictEqual(
      createdAlarmPeriod,
      BOOKMARK_SYNC_ALARM_PERIOD_MINUTES
    );
    assert.ok(alarmListener);

    alarmListener?.({ name: BOOKMARK_SYNC_ALARM_NAME });
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    alarmListener?.({ name: "another-alarm" });
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    alarmListener?.({});
    await Promise.resolve();
    assert.strictEqual(callCount, 2);
  });

  it("logs synchronization failures", async () => {
    let installedListener: ((...args: unknown[]) => void) | undefined;
    const runtime = {
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          installedListener = listener;
        }
      }
    };

    const error = new Error("boom");
    const synchronizer = () => Promise.reject(error);

    const originalConsoleError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      registerBackgroundListeners({ runtime }, synchronizer);

      assert.ok(installedListener);
      installedListener?.();
      await Promise.resolve();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0][0], "Failed to synchronize bookmarks");
      assert.strictEqual(calls[0][1], error);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe("synchronizeBookmarks", () => {
  it("indexes bookmarks and persists the snapshot", async () => {
    stubSyncSettings({ enabled: true, keySource: "platform" });

    const chromium: Bookmark[] = [
      {
        id: "c-1",
        title: "Chromium",
        url: "https://chromium.example",
        tags: ["chromium"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const firefox: Bookmark[] = [
      {
        id: "f-1",
        title: "Firefox",
        url: "https://firefox.example",
        tags: ["firefox"],
        createdAt: "2024-01-02T00:00:00.000Z",
        source: "firefox"
      }
    ];

    const merged: Bookmark[] = [...chromium, ...firefox];
    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "browsers"
      },
      {
        ...merged[1],
        category: "mozilla"
      }
    ];

    const restorePipeline = stubSynchronizationPipeline({
      chromium,
      firefox,
      merged,
      categorized
    });

    const indexCalls: Array<[CategorizedBookmark[], Bookmark[]]> = [];
    const originalIndex = searchBookmarks.index;
    searchBookmarks.index = ((bookmarks, mergedInput = []) => {
      indexCalls.push([bookmarks, mergedInput]);
      return originalIndex.call(searchBookmarks, bookmarks, mergedInput);
    }) as typeof searchBookmarks.index;

    const persistCalls: unknown[] = [];
    const originalPersist = searchBookmarks.persistSnapshot;
    searchBookmarks.persistSnapshot = (async () => {
      persistCalls.push(undefined);
    }) as typeof searchBookmarks.persistSnapshot;

    try {
      await synchronizeBookmarks();
    } finally {
      searchBookmarks.index = originalIndex;
      searchBookmarks.persistSnapshot = originalPersist;
      restorePipeline();
    }

    assert.strictEqual(indexCalls.length, 1);
    assert.deepStrictEqual(indexCalls[0][0], categorized);
    assert.deepStrictEqual(indexCalls[0][1], merged);
    assert.strictEqual(persistCalls.length, 1);
  });

  it("logs persistence failures and resolves", async () => {
    stubSyncSettings({ enabled: true, keySource: "platform" });

    const chromium: Bookmark[] = [
      {
        id: "c-2",
        title: "Chromium Docs",
        url: "https://chromium.example/docs",
        tags: ["chromium"],
        createdAt: "2024-02-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const firefox: Bookmark[] = [];

    const merged: Bookmark[] = [...chromium];
    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "documentation"
      }
    ];

    const restorePipeline = stubSynchronizationPipeline({
      chromium,
      firefox,
      merged,
      categorized
    });

    const error = new Error("persist failed");
    const originalPersist = searchBookmarks.persistSnapshot;
    searchBookmarks.persistSnapshot = (async () => {
      throw error;
    }) as typeof searchBookmarks.persistSnapshot;

    const originalConsoleError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      await synchronizeBookmarks();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0][0], "Failed to persist bookmark snapshot");
      assert.strictEqual(calls[0][1], error);
    } finally {
      console.error = originalConsoleError;
      searchBookmarks.persistSnapshot = originalPersist;
      restorePipeline();
    }
  });

  it("indexes bookmarks without persisting to sync storage when synchronization is disabled", async () => {
    stubSyncSettings({ enabled: false, keySource: "platform" });

    const chromium: Bookmark[] = [
      {
        id: "c-disabled-1",
        title: "Chromium Reference",
        url: "https://chromium.example/reference",
        tags: ["chromium"],
        createdAt: "2024-03-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const firefox: Bookmark[] = [
      {
        id: "f-disabled-1",
        title: "Firefox Guide",
        url: "https://firefox.example/guide",
        tags: ["firefox"],
        createdAt: "2024-03-02T00:00:00.000Z",
        source: "firefox"
      }
    ];

    const merged: Bookmark[] = [...chromium, ...firefox];
    const categorized: CategorizedBookmark[] = [
      {
        ...merged[0],
        category: "chromium"
      },
      {
        ...merged[1],
        category: "mozilla"
      }
    ];

    const restorePipeline = stubSynchronizationPipeline({
      chromium,
      firefox,
      merged,
      categorized
    });

    const indexCalls: Array<[CategorizedBookmark[], Bookmark[]]> = [];
    const originalIndex = searchBookmarks.index;
    searchBookmarks.index = ((bookmarks, mergedInput = []) => {
      indexCalls.push([bookmarks, mergedInput]);
      return originalIndex.call(searchBookmarks, bookmarks, mergedInput);
    }) as typeof searchBookmarks.index;

    const calls: Array<{ area: string; items: Record<string, unknown> }> = [];
    const extensionGlobals = globalThis as typeof globalThis & {
      browser?: {
        storage?: {
          local?: {
            get?: (key: unknown) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
          };
          sync?: {
            get?: (key: unknown) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
          };
        };
      };
      chrome?: {
        storage?: unknown;
      };
    };
    const hadBrowser = Object.prototype.hasOwnProperty.call(extensionGlobals, "browser");
    const hadChrome = Object.prototype.hasOwnProperty.call(extensionGlobals, "chrome");
    const originalBrowser = extensionGlobals.browser;
    const originalChrome = extensionGlobals.chrome;

    extensionGlobals.browser = {
      storage: {
        local: {
          async set(items: Record<string, unknown>) {
            calls.push({ area: "local", items });
          }
        },
        sync: {
          async set(items: Record<string, unknown>) {
            calls.push({ area: "sync", items });
          }
        }
      }
    };

    try {
      await synchronizeBookmarks();
    } finally {
      searchBookmarks.index = originalIndex;
      restorePipeline();

      if (hadBrowser) {
        extensionGlobals.browser = originalBrowser;
      } else {
        delete extensionGlobals.browser;
      }

      if (hadChrome) {
        extensionGlobals.chrome = originalChrome;
      } else {
        delete extensionGlobals.chrome;
      }
    }

    assert.strictEqual(indexCalls.length, 1);
    assert.deepStrictEqual(indexCalls[0][0], categorized);
    assert.deepStrictEqual(indexCalls[0][1], merged);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].area, "local");
    assert.ok(
      Object.prototype.hasOwnProperty.call(
        calls[0].items,
        BOOKMARK_SNAPSHOT_STORAGE_KEY
      )
    );
    assert.deepStrictEqual(calls[0].items[BOOKMARK_SNAPSHOT_STORAGE_KEY], {
      version: 1,
      kind: "plain",
      snapshot: { merged, categorized }
    });
  });

  it("preserves bookmarks collected from different browsers across consecutive runs", async () => {
    stubSyncSettings({ enabled: true, keySource: "platform" });

    const chromiumBookmarks: Bookmark[] = [
      {
        id: "chromium-shared-1",
        title: "Chromium Shared",
        url: "https://chromium.shared",
        tags: ["chromium"],
        createdAt: "2024-04-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const firefoxBookmarks: Bookmark[] = [
      {
        id: "firefox-shared-1",
        title: "Firefox Shared",
        url: "https://firefox.shared",
        tags: ["firefox"],
        createdAt: "2024-04-02T00:00:00.000Z",
        source: "firefox"
      }
    ];

    const combinedMerged: Bookmark[] = [
      ...firefoxBookmarks,
      ...chromiumBookmarks
    ];

    const chromiumCategorized: CategorizedBookmark[] = [
      {
        ...chromiumBookmarks[0],
        category: "chromium"
      }
    ];

    const combinedCategorized: CategorizedBookmark[] = [
      {
        ...firefoxBookmarks[0],
        category: "mozilla"
      },
      {
        ...chromiumBookmarks[0],
        category: "chromium"
      }
    ];

    const chromiumSequence: Array<{
      bookmarks: Bookmark[];
      availability: BookmarkProviderAvailability;
    }> = [
      { bookmarks: chromiumBookmarks, availability: "success" },
      { bookmarks: [], availability: "unavailable" }
    ];
    const firefoxSequence: Array<{
      bookmarks: Bookmark[];
      availability: BookmarkProviderAvailability;
    }> = [
      { bookmarks: [], availability: "unavailable" },
      { bookmarks: firefoxBookmarks, availability: "success" }
    ];

    const mergeResults = [
      [...chromiumBookmarks],
      [...firefoxBookmarks]
    ];
    const mergeCalls: Array<[Bookmark[], Bookmark[]]> = [];
    const categorizeCalls: Bookmark[][] = [];
    const persistedSnapshots: Bookmark[][] = [];

    let chromiumCall = 0;
    let firefoxCall = 0;
    let mergeCall = 0;
    let categorizeCall = 0;

    setSynchronizeBookmarksDependencies({
      fetchChromiumBookmarks: async () => {
        const current =
          chromiumSequence[chromiumCall] ?? {
            bookmarks: [],
            availability: "unavailable" as const
          };
        chromiumCall += 1;
        return current;
      },
      fetchFirefoxBookmarks: async () => {
        const current =
          firefoxSequence[firefoxCall] ?? {
            bookmarks: [],
            availability: "unavailable" as const
          };
        firefoxCall += 1;
        return current;
      },
      mergeBookmarks: (
        chromiumInput: Bookmark[],
        firefoxInput: Bookmark[]
      ) => {
        mergeCalls.push([chromiumInput, firefoxInput]);
        const result = mergeResults[mergeCall] ?? [];
        mergeCall += 1;
        return result;
      },
      categorizeBookmarksWithLLM: async (bookmarks: Bookmark[]) => {
        categorizeCalls.push([...bookmarks]);
        if (categorizeCall === 0) {
          categorizeCall += 1;
          return chromiumCategorized;
        }

        categorizeCall += 1;
        return combinedCategorized;
      }
    });

    const originalPersist = searchBookmarks.persistSnapshot;
    searchBookmarks.persistSnapshot = (async () => {
      persistedSnapshots.push(searchBookmarks.getMergedSnapshot());
    }) as typeof searchBookmarks.persistSnapshot;

    try {
      await synchronizeBookmarks();
      await synchronizeBookmarks();
    } finally {
      resetSynchronizeBookmarksDependencies();
      searchBookmarks.persistSnapshot = originalPersist;
    }

    assert.strictEqual(mergeCalls.length, 2);
    assert.deepStrictEqual(mergeCalls[0], [chromiumBookmarks, []]);
    assert.deepStrictEqual(mergeCalls[1], [[], firefoxBookmarks]);

    assert.strictEqual(categorizeCalls.length, 2);
    assert.deepStrictEqual(categorizeCalls[0], chromiumBookmarks);
    assert.deepStrictEqual(categorizeCalls[1], combinedMerged);

    assert.strictEqual(persistedSnapshots.length, 2);
    assert.deepStrictEqual(persistedSnapshots[0], chromiumBookmarks);
    assert.deepStrictEqual(persistedSnapshots[1], combinedMerged);

    assert.deepStrictEqual(searchBookmarks.query(""), combinedCategorized);
  });

  it("removes Chromium bookmarks that disappear from later fetches", async () => {
    stubSyncSettings({ enabled: true, keySource: "platform" });

    const chromiumBookmark: Bookmark = {
      id: "chromium-vanish-1",
      title: "Chromium Vanish",
      url: "https://chromium.example/vanish",
      tags: ["chromium"],
      createdAt: "2024-05-01T00:00:00.000Z",
      source: "chromium"
    };

    const firefoxBookmark: Bookmark = {
      id: "firefox-keep-1",
      title: "Firefox Keep",
      url: "https://firefox.example/keep",
      tags: ["firefox"],
      createdAt: "2024-05-02T00:00:00.000Z",
      source: "firefox"
    };

    const chromiumResults = [
      { bookmarks: [chromiumBookmark], availability: "success" as const },
      { bookmarks: [], availability: "success" as const }
    ];
    const firefoxResults = [
      { bookmarks: [firefoxBookmark], availability: "success" as const },
      { bookmarks: [firefoxBookmark], availability: "success" as const }
    ];

    let chromiumCall = 0;
    let firefoxCall = 0;

    setSynchronizeBookmarksDependencies({
      fetchChromiumBookmarks: async () => {
        const result = chromiumResults[chromiumCall] ?? {
          bookmarks: [],
          availability: "success" as const
        };
        chromiumCall += 1;
        return result;
      },
      fetchFirefoxBookmarks: async () => {
        const result = firefoxResults[firefoxCall] ?? {
          bookmarks: [],
          availability: "success" as const
        };
        firefoxCall += 1;
        return result;
      },
      categorizeBookmarksWithLLM: async (bookmarks: Bookmark[]) =>
        bookmarks.map((bookmark) => ({
          ...bookmark,
          category: `category:${bookmark.id}`
        }))
    });

    const originalPersist = searchBookmarks.persistSnapshot;
    const persistedSnapshots: Bookmark[][] = [];
    searchBookmarks.persistSnapshot = (async () => {
      persistedSnapshots.push(searchBookmarks.getMergedSnapshot());
    }) as typeof searchBookmarks.persistSnapshot;

    try {
      await synchronizeBookmarks();
      await synchronizeBookmarks();
    } finally {
      searchBookmarks.persistSnapshot = originalPersist;
      resetSynchronizeBookmarksDependencies();
    }

    assert.strictEqual(persistedSnapshots.length, 2);
    assert.deepStrictEqual(persistedSnapshots[0], [chromiumBookmark, firefoxBookmark]);
    assert.deepStrictEqual(persistedSnapshots[1], [firefoxBookmark]);
    assert.deepStrictEqual(searchBookmarks.getMergedSnapshot(), [firefoxBookmark]);
  });

  it("removes Firefox bookmarks that disappear from later fetches", async () => {
    stubSyncSettings({ enabled: true, keySource: "platform" });

    const chromiumBookmark: Bookmark = {
      id: "chromium-keep-1",
      title: "Chromium Keep",
      url: "https://chromium.example/keep",
      tags: ["chromium"],
      createdAt: "2024-06-01T00:00:00.000Z",
      source: "chromium"
    };

    const firefoxBookmark: Bookmark = {
      id: "firefox-vanish-1",
      title: "Firefox Vanish",
      url: "https://firefox.example/vanish",
      tags: ["firefox"],
      createdAt: "2024-06-02T00:00:00.000Z",
      source: "firefox"
    };

    const chromiumResults = [
      { bookmarks: [chromiumBookmark], availability: "success" as const },
      { bookmarks: [chromiumBookmark], availability: "success" as const }
    ];
    const firefoxResults = [
      { bookmarks: [firefoxBookmark], availability: "success" as const },
      { bookmarks: [], availability: "success" as const }
    ];

    let chromiumCall = 0;
    let firefoxCall = 0;

    setSynchronizeBookmarksDependencies({
      fetchChromiumBookmarks: async () => {
        const result = chromiumResults[chromiumCall] ?? {
          bookmarks: [],
          availability: "success" as const
        };
        chromiumCall += 1;
        return result;
      },
      fetchFirefoxBookmarks: async () => {
        const result = firefoxResults[firefoxCall] ?? {
          bookmarks: [],
          availability: "success" as const
        };
        firefoxCall += 1;
        return result;
      },
      categorizeBookmarksWithLLM: async (bookmarks: Bookmark[]) =>
        bookmarks.map((bookmark) => ({
          ...bookmark,
          category: `category:${bookmark.id}`
        }))
    });

    const originalPersist = searchBookmarks.persistSnapshot;
    const persistedSnapshots: Bookmark[][] = [];
    searchBookmarks.persistSnapshot = (async () => {
      persistedSnapshots.push(searchBookmarks.getMergedSnapshot());
    }) as typeof searchBookmarks.persistSnapshot;

    try {
      await synchronizeBookmarks();
      await synchronizeBookmarks();
    } finally {
      searchBookmarks.persistSnapshot = originalPersist;
      resetSynchronizeBookmarksDependencies();
    }

    assert.strictEqual(persistedSnapshots.length, 2);
    assert.deepStrictEqual(persistedSnapshots[0], [chromiumBookmark, firefoxBookmark]);
    assert.deepStrictEqual(persistedSnapshots[1], [chromiumBookmark]);
    assert.deepStrictEqual(searchBookmarks.getMergedSnapshot(), [chromiumBookmark]);
  });
});

describe("bootstrapBackground", () => {
  it("hydrates the search index before registering listeners", async () => {
    const deferred = createDeferred<void>();
    const originalHydrate = searchBookmarks.hydrateFromStorage;
    let listenerRegistered = false;

    searchBookmarks.hydrateFromStorage = () => deferred.promise;

    const extensionAPI = {
      runtime: {
        onInstalled: {
          addListener: () => {
            listenerRegistered = true;
          }
        }
      }
    };

    const bootstrapPromise = bootstrapBackground(extensionAPI);

    await Promise.resolve();
    assert.strictEqual(listenerRegistered, false);

    deferred.resolve();

    await bootstrapPromise;

    assert.strictEqual(listenerRegistered, true);

    searchBookmarks.hydrateFromStorage = originalHydrate;
  });

  it("logs hydration failures and still registers listeners", async () => {
    const error = new Error("hydrate failure");
    const originalHydrate = searchBookmarks.hydrateFromStorage;
    searchBookmarks.hydrateFromStorage = () => Promise.reject(error);

    let listenerRegistered = false;
    const extensionAPI = {
      runtime: {
        onInstalled: {
          addListener: () => {
            listenerRegistered = true;
          }
        }
      }
    };

    const originalConsoleError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      await bootstrapBackground(extensionAPI);

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(
        calls[0][0],
        "Failed to hydrate search index from storage"
      );
      assert.strictEqual(calls[0][1], error);
      assert.strictEqual(listenerRegistered, true);
    } finally {
      console.error = originalConsoleError;
      searchBookmarks.hydrateFromStorage = originalHydrate;
    }
  });
});
