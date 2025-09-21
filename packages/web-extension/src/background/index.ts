import { mergeBookmarks } from "../domain/services/merger";
import { categorizeBookmarksWithLLM } from "../domain/services/llm-categorizer";
import { searchBookmarks } from "../domain/services/search";
import { fetchChromiumBookmarks } from "./bookmark-sync/chromium-provider";
import { fetchFirefoxBookmarks } from "./bookmark-sync/firefox-provider";
import { loadSyncSettings } from "../domain/services/sync-settings";

export const BOOKMARK_SYNC_ALARM_NAME = "capybara::bookmark-sync";
export const BOOKMARK_SYNC_ALARM_PERIOD_MINUTES = 30;

type RuntimeEvent = {
  addListener: (listener: (...args: unknown[]) => void) => void;
};

type RuntimeAPI = {
  onInstalled?: RuntimeEvent;
  onStartup?: RuntimeEvent;
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
  let settings: { enabled: boolean };

  try {
    settings = await loadSyncSettings();
  } catch (error) {
    console.error("Failed to load synchronization settings", error);
    settings = { enabled: false };
  }

  if (!settings.enabled) {
    return;
  }

  const [chromiumBookmarks, firefoxBookmarks] = await Promise.all([
    fetchChromiumBookmarks(),
    fetchFirefoxBookmarks()
  ]);

  const merged = mergeBookmarks(chromiumBookmarks, firefoxBookmarks);
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
  registerAlarmListener(extensionAPI.alarms, handler);
}

const detectedExtensionAPI: BackgroundExtensionAPI | undefined =
  (typeof browser !== "undefined"
    ? (browser as unknown as BackgroundExtensionAPI)
    : undefined) ??
  (typeof chrome !== "undefined"
    ? (chrome as unknown as BackgroundExtensionAPI)
    : undefined);

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

void bootstrapBackground();
