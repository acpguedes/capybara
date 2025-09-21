import {
  DEFAULT_SYNC_SETTINGS,
  SYNC_SETTINGS_STORAGE_KEY,
  type SyncKeySource,
  type SyncSettings
} from "../models/sync-settings";
import { getItem, setItem } from "./extension-storage";

function normalizeKeySource(value: unknown, secret: string | undefined): SyncKeySource {
  if (secret && value === "user") {
    return "user";
  }

  return "platform";
}

function normalizeSecret(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSettings(value: Partial<SyncSettings> | null | undefined): SyncSettings {
  const secret = normalizeSecret(value?.secret);
  const keySource = normalizeKeySource(value?.keySource, secret);

  return {
    enabled: value?.enabled === true,
    keySource,
    ...(secret && keySource === "user" ? { secret } : {})
  };
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  const stored = await getItem(SYNC_SETTINGS_STORAGE_KEY, { area: "local" });

  if (!stored) {
    return { ...DEFAULT_SYNC_SETTINGS };
  }

  return normalizeSettings(stored);
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  const normalized = normalizeSettings(settings);

  await setItem(SYNC_SETTINGS_STORAGE_KEY, normalized, { area: "local" });
}
