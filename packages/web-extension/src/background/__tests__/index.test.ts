import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARK_SYNC_ALARM_NAME,
  BOOKMARK_SYNC_ALARM_PERIOD_MINUTES,
  bootstrapBackground,
  registerBackgroundListeners,
  synchronizeBookmarks
} from "../index";
import { searchBookmarks } from "../../domain/services/search";
import { BOOKMARK_SNAPSHOT_STORAGE_KEY } from "../../domain/models/bookmark-snapshot";
import type { Bookmark } from "../../domain/models/bookmark";
import type { CategorizedBookmark } from "../../domain/models/categorized-bookmark";
import { RUNTIME_SYNC_NOW_MESSAGE_TYPE } from "../../shared/runtime-messages";

const chromiumProvider: any = require("../bookmark-sync/chromium-provider");
const firefoxProvider: any = require("../bookmark-sync/firefox-provider");
const mergerModule: any = require("../../domain/services/merger");
const llmCategorizerModule: any = require("../../domain/services/llm-categorizer");
const syncSettingsModule: any = require("../../domain/services/sync-settings");

const originalLoadSyncSettings = syncSettingsModule.loadSyncSettings as () => Promise<{
  enabled: boolean;
  keySource: string;
  secret?: string;
}>;

function stubSyncSettings(settings: {
  enabled: boolean;
  keySource: string;
  secret?: string;
}): void {
  syncSettingsModule.loadSyncSettings = async () => settings;
}

function stubSynchronizationPipeline(options: {
  chromium: Bookmark[];
  firefox: Bookmark[];
  merged: Bookmark[];
  categorized: CategorizedBookmark[];
}): () => void {
  const originalChromium = chromiumProvider.fetchChromiumBookmarks;
  const originalFirefox = firefoxProvider.fetchFirefoxBookmarks;
  const originalMerge = mergerModule.mergeBookmarks;
  const originalCategorize = llmCategorizerModule.categorizeBookmarksWithLLM;

  chromiumProvider.fetchChromiumBookmarks = async () => options.chromium;
  firefoxProvider.fetchFirefoxBookmarks = async () => options.firefox;
  mergerModule.mergeBookmarks = () => options.merged;
  llmCategorizerModule.categorizeBookmarksWithLLM = async () =>
    options.categorized;

  return () => {
    chromiumProvider.fetchChromiumBookmarks = originalChromium;
    firefoxProvider.fetchFirefoxBookmarks = originalFirefox;
    mergerModule.mergeBookmarks = originalMerge;
    llmCategorizerModule.categorizeBookmarksWithLLM = originalCategorize;
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
  syncSettingsModule.loadSyncSettings = originalLoadSyncSettings;
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
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ];

    const firefox: Bookmark[] = [
      {
        id: "f-1",
        title: "Firefox",
        url: "https://firefox.example",
        tags: ["firefox"],
        createdAt: "2024-01-02T00:00:00.000Z"
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
        createdAt: "2024-02-01T00:00:00.000Z"
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
        createdAt: "2024-03-01T00:00:00.000Z"
      }
    ];

    const firefox: Bookmark[] = [
      {
        id: "f-disabled-1",
        title: "Firefox Guide",
        url: "https://firefox.example/guide",
        tags: ["firefox"],
        createdAt: "2024-03-02T00:00:00.000Z"
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
