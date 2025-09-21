import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadSyncSettings, saveSyncSettings } from "../sync-settings";
import { SYNC_SETTINGS_STORAGE_KEY } from "../../models/sync-settings";

type MockStorageArea = {
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type ExtensionNamespace = {
  storage: {
    local: MockStorageArea;
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
});

describe("synchronization settings service", () => {
  it("returns default settings when storage is empty", async () => {
    extensionGlobals.browser = {
      storage: {
        local: {
          async get(key) {
            assert.strictEqual(key, SYNC_SETTINGS_STORAGE_KEY);
            return {};
          },
          async set() {
            throw new Error("unexpected write");
          }
        }
      }
    };

    const settings = await loadSyncSettings();

    assert.deepStrictEqual(settings, { enabled: false, keySource: "platform" });
  });

  it("normalizes secrets and key sources on save", async () => {
    const storageState: Record<string, unknown> = {};

    extensionGlobals.browser = {
      storage: {
        local: {
          async get() {
            return { ...storageState };
          },
          async set(items) {
            Object.assign(storageState, items);
          }
        }
      }
    };

    await saveSyncSettings({
      enabled: true,
      keySource: "user",
      secret: "  passphrase  "
    });

    assert.deepStrictEqual(storageState[SYNC_SETTINGS_STORAGE_KEY], {
      enabled: true,
      keySource: "user",
      secret: "passphrase"
    });
  });

  it("falls back to platform derived keys when no secret is provided", async () => {
    const storageState: Record<string, unknown> = {};

    extensionGlobals.browser = {
      storage: {
        local: {
          async get() {
            return { ...storageState };
          },
          async set(items) {
            Object.assign(storageState, items);
          }
        }
      }
    };

    await saveSyncSettings({
      enabled: true,
      keySource: "user",
      secret: "  "
    });

    assert.deepStrictEqual(storageState[SYNC_SETTINGS_STORAGE_KEY], {
      enabled: true,
      keySource: "platform"
    });
  });
});
