import {
  mergeBookmarks as defaultMergeBookmarks,
  normalizeBookmarkUrl
} from "../domain/services/merger";
import { categorizeBookmarksWithLLM as defaultCategorizeBookmarksWithLLM } from "../domain/services/llm-categorizer";
import { searchBookmarks } from "../domain/services/search";
import type { Bookmark, BookmarkSource } from "../domain/models/bookmark";
import { fetchChromiumBookmarks as defaultFetchChromiumBookmarks } from "./bookmark-sync/chromium-provider";
import { fetchFirefoxBookmarks as defaultFetchFirefoxBookmarks } from "./bookmark-sync/firefox-provider";
import { isRuntimeSyncNowMessage } from "../shared/runtime-messages";
import type {
  BookmarkProviderAvailability,
  BookmarkProviderResult
} from "./bookmark-sync/provider-result";

export const BOOKMARK_SYNC_ALARM_NAME = "capybara::bookmark-sync";
export const BOOKMARK_SYNC_ALARM_PERIOD_MINUTES = 30;

type SynchronizeBookmarksDependencies = {
  fetchChromiumBookmarks: typeof defaultFetchChromiumBookmarks;
  fetchFirefoxBookmarks: typeof defaultFetchFirefoxBookmarks;
  mergeBookmarks: typeof defaultMergeBookmarks;
  categorizeBookmarksWithLLM: typeof defaultCategorizeBookmarksWithLLM;
};

const defaultSynchronizeBookmarksDependencies: SynchronizeBookmarksDependencies = {
  fetchChromiumBookmarks: defaultFetchChromiumBookmarks,
  fetchFirefoxBookmarks: defaultFetchFirefoxBookmarks,
  mergeBookmarks: defaultMergeBookmarks,
  categorizeBookmarksWithLLM: defaultCategorizeBookmarksWithLLM
};

let synchronizeBookmarksDependencies: SynchronizeBookmarksDependencies = {
  ...defaultSynchronizeBookmarksDependencies
};

export function setSynchronizeBookmarksDependencies(
  overrides: Partial<SynchronizeBookmarksDependencies>
): void {
  synchronizeBookmarksDependencies = {
    ...synchronizeBookmarksDependencies,
    ...overrides
  };
}

export function resetSynchronizeBookmarksDependencies(): void {
  synchronizeBookmarksDependencies = {
    ...defaultSynchronizeBookmarksDependencies
  };
}

type ProviderAvailabilityMap = Record<
  BookmarkSource,
  BookmarkProviderAvailability
>;

function combineWithExistingBookmarks(
  latest: Bookmark[],
  existing: Bookmark[],
  availability: ProviderAvailabilityMap
): Bookmark[] {
  if (existing.length === 0) {
    return [...latest];
  }

  const combined = [...latest];
  const seen = new Set(
    latest.map((bookmark) => normalizeBookmarkUrl(bookmark.url))
  );

  for (const bookmark of existing) {
    const normalizedUrl = normalizeBookmarkUrl(bookmark.url);

    if (seen.has(normalizedUrl)) {
      continue;
    }

    const source = bookmark.source;

    if (availability[source] === "success") {
      continue;
    }

    combined.push(bookmark);
    seen.add(normalizedUrl);
  }

  return combined;
}

type RuntimeEvent = {
  addListener: (listener: (...args: unknown[]) => void) => void;
};

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => void;

type RuntimeMessageEvent = {
  addListener: (listener: RuntimeMessageListener) => void;
};

type RuntimeAPI = {
  onInstalled?: RuntimeEvent;
  onStartup?: RuntimeEvent;
  onMessage?: RuntimeMessageEvent;
};

type AlarmListener = (alarm?: { name?: string }) => void;

type AlarmsAPI = {
  create?: (name: string, info: { periodInMinutes: number }) => void;
  onAlarm?: {
    addListener: (listener: AlarmListener) => void;
  };
};

export type BackgroundExtensionAPI = {
  runtime?: RuntimeAPI;
  alarms?: AlarmsAPI;
};

export async function synchronizeBookmarks(): Promise<void> {
  const {
    fetchChromiumBookmarks,
    fetchFirefoxBookmarks,
    mergeBookmarks,
    categorizeBookmarksWithLLM
  } = synchronizeBookmarksDependencies;

  const [chromiumResult, firefoxResult] = await Promise.all([
    fetchChromiumBookmarks().catch(
      (error): BookmarkProviderResult => {
        console.error("Failed to fetch Chromium bookmarks", error);
        return { bookmarks: [], availability: "unavailable" };
      }
    ),
    fetchFirefoxBookmarks().catch(
      (error): BookmarkProviderResult => {
        console.error("Failed to fetch Firefox bookmarks", error);
        return { bookmarks: [], availability: "unavailable" };
      }
    )
  ]);

  const latestMerged = mergeBookmarks(
    chromiumResult.bookmarks,
    firefoxResult.bookmarks
  );
  const existingMerged = searchBookmarks.getMergedSnapshot();
  const merged = combineWithExistingBookmarks(latestMerged, existingMerged, {
    chromium: chromiumResult.availability,
    firefox: firefoxResult.availability
  });

  const categorized = await categorizeBookmarksWithLLM(merged);
  searchBookmarks.index(categorized, merged);

  try {
    await searchBookmarks.persistSnapshot();
  } catch (error) {
    console.error("Failed to persist bookmark snapshot", error);
  }
}

function createSynchronizationHandler(
  synchronizer: () => Promise<void>
): () => void {
  return () => {
    synchronizer().catch((error: unknown) => {
      console.error("Failed to synchronize bookmarks", error);
    });
  };
}

function attachRuntimeListener(
  event: RuntimeEvent | undefined,
  handler: () => void
): void {
  if (!event?.addListener) {
    return;
  }

  event.addListener(() => {
    handler();
  });
}

function attachRuntimeMessageListener(
  event: RuntimeMessageEvent | undefined,
  handler: () => void
): void {
  if (!event?.addListener) {
    return;
  }

  event.addListener((message) => {
    if (isRuntimeSyncNowMessage(message)) {
      handler();
    }
  });
}

function registerAlarmListener(
  alarms: AlarmsAPI | undefined,
  handler: () => void
): void {
  if (!alarms) {
    return;
  }

  const { onAlarm, create } = alarms;

  if (onAlarm?.addListener) {
    onAlarm.addListener((alarm) => {
      if (!alarm?.name || alarm.name === BOOKMARK_SYNC_ALARM_NAME) {
        handler();
      }
    });
  }

  if (create) {
    try {
      create(BOOKMARK_SYNC_ALARM_NAME, {
        periodInMinutes: BOOKMARK_SYNC_ALARM_PERIOD_MINUTES
      });
    } catch (error) {
      console.error(
        "Failed to schedule bookmark synchronization alarm",
        error
      );
    }
  }
}

export function registerBackgroundListeners(
  extensionAPI: BackgroundExtensionAPI | undefined,
  synchronizer: () => Promise<void> = synchronizeBookmarks
): void {
  if (!extensionAPI) {
    return;
  }

  const handler = createSynchronizationHandler(synchronizer);

  attachRuntimeListener(extensionAPI.runtime?.onInstalled, handler);
  attachRuntimeListener(extensionAPI.runtime?.onStartup, handler);
  attachRuntimeMessageListener(extensionAPI.runtime?.onMessage, handler);
  registerAlarmListener(extensionAPI.alarms, handler);
}

type ExtensionGlobals = typeof globalThis & {
  browser?: { storage?: unknown };
  chrome?: { storage?: unknown };
};

const extensionGlobals = globalThis as ExtensionGlobals;

const detectedExtensionAPI: BackgroundExtensionAPI | undefined =
  (extensionGlobals.browser as unknown as BackgroundExtensionAPI | undefined) ??
  (extensionGlobals.chrome as unknown as BackgroundExtensionAPI | undefined);

const shouldBootstrapAutomatically =
  Boolean(extensionGlobals.browser?.storage) ||
  Boolean(extensionGlobals.chrome?.storage);

export async function bootstrapBackground(
  extensionAPI: BackgroundExtensionAPI | undefined = detectedExtensionAPI
): Promise<void> {
  try {
    await searchBookmarks.hydrateFromStorage();
  } catch (error) {
    console.error("Failed to hydrate search index from storage", error);
  }

  registerBackgroundListeners(extensionAPI);
}

if (shouldBootstrapAutomatically) {
  void bootstrapBackground(detectedExtensionAPI);
}
