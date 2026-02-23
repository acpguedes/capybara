import {
  BOOKMARK_SNAPSHOT_STORAGE_KEY,
  type BookmarkSnapshotStorageValue
} from "../models/bookmark-snapshot";
import {
  LLM_CONFIGURATION_STORAGE_KEY,
  type LLMConfiguration
} from "../models/llm-configuration";
import {
  SYNC_SETTINGS_STORAGE_KEY,
  type SyncSettings
} from "../models/sync-settings";
import {
  CATEGORIES_STORAGE_KEY,
  type Category
} from "../models/category";
import {
  BOOKMARK_RELATIONS_STORAGE_KEY,
  type BookmarkRelation
} from "../models/bookmark-relation";
import {
  USAGE_EVENTS_STORAGE_KEY,
  type UsageEvent
} from "../models/usage-event";

type StorageKeyMap = {
  [LLM_CONFIGURATION_STORAGE_KEY]: LLMConfiguration;
  [BOOKMARK_SNAPSHOT_STORAGE_KEY]: BookmarkSnapshotStorageValue;
  [SYNC_SETTINGS_STORAGE_KEY]: SyncSettings;
  [CATEGORIES_STORAGE_KEY]: Category[];
  [BOOKMARK_RELATIONS_STORAGE_KEY]: BookmarkRelation[];
  [USAGE_EVENTS_STORAGE_KEY]: UsageEvent[];
};

type StorageKey = keyof StorageKeyMap;

type StorageValue<K extends StorageKey> = StorageKeyMap[K];

type StorageArea = {
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type StorageAreaName = "local" | "sync";

type ExtensionStorageNamespace = Partial<Record<StorageAreaName, StorageArea>>;

type StorageOptions = {
  area?: StorageAreaName | StorageAreaName[];
};

type ExtensionGlobals = typeof globalThis & {
  browser?: { storage?: ExtensionStorageNamespace };
  chrome?: { storage?: ExtensionStorageNamespace };
};

const DEFAULT_STORAGE_AREAS: StorageAreaName[] = ["local"];

function resolveStorageNamespace(): ExtensionStorageNamespace {
  const globals = globalThis as ExtensionGlobals;
  const namespace = globals.browser?.storage ?? globals.chrome?.storage;

  if (!namespace) {
    throw new Error("Extension storage is unavailable");
  }

  return namespace;
}

function normalizeAreas(
  area?: StorageOptions["area"]
): StorageAreaName[] {
  if (!area) {
    return DEFAULT_STORAGE_AREAS;
  }

  return Array.isArray(area) ? area : [area];
}

function resolveStorageAreas(areas: StorageAreaName[]): StorageArea[] {
  const namespace = resolveStorageNamespace();

  const resolved = areas
    .map((area) => namespace[area])
    .filter((value): value is StorageArea => Boolean(value));

  if (resolved.length === 0) {
    throw new Error("Extension storage is unavailable");
  }

  return resolved;
}

export async function getItem<K extends StorageKey>(
  key: K,
  options?: StorageOptions
): Promise<StorageValue<K> | null> {
  const storageAreas = resolveStorageAreas(normalizeAreas(options?.area));

  for (const storage of storageAreas) {
    const result = await storage.get(key);
    const record = result ?? {};

    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key] ?? null;
      return value as StorageValue<K> | null;
    }
  }

  return null;
}

export async function setItem<K extends StorageKey>(
  key: K,
  value: StorageValue<K>,
  options?: StorageOptions
): Promise<void> {
  const storageAreas = resolveStorageAreas(normalizeAreas(options?.area));

  await Promise.all(storageAreas.map((storage) => storage.set({ [key]: value })));
}
