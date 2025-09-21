import { LLM_CONFIGURATION_STORAGE_KEY, type LLMConfiguration } from "../models/llm-configuration";

type StorageKeyMap = {
  [LLM_CONFIGURATION_STORAGE_KEY]: LLMConfiguration;
};

type StorageKey = keyof StorageKeyMap & string;

type StorageValue<K extends StorageKey> = StorageKeyMap[K];

type StorageArea = {
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type ExtensionStorageNamespace = {
  local: StorageArea;
};

type ExtensionGlobals = typeof globalThis & {
  browser?: { storage?: ExtensionStorageNamespace };
  chrome?: { storage?: ExtensionStorageNamespace };
};

function resolveStorageArea(): StorageArea {
  const globals = globalThis as ExtensionGlobals;
  const namespace = globals.browser?.storage ?? globals.chrome?.storage;

  if (!namespace?.local) {
    throw new Error("Extension storage is unavailable");
  }

  return namespace.local;
}

export async function getItem<K extends StorageKey>(key: K): Promise<StorageValue<K> | null> {
  const storage = resolveStorageArea();
  const result = await storage.get(key);
  const record = (result ?? {}) as Record<string, unknown>;
  const value = (record[key] ?? null) as StorageValue<K> | null;
  return value;
}

export async function setItem<K extends StorageKey>(key: K, value: StorageValue<K>): Promise<void> {
  const storage = resolveStorageArea();
  await storage.set({ [key]: value });
}
