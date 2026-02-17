import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { getItem, setItem } from "../extension-storage";
import { loadLLMConfiguration, saveLLMConfiguration } from "../llm-settings";
import { LLM_CONFIGURATION_STORAGE_KEY, type LLMConfiguration } from "../../models/llm-configuration";

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

describe("extension storage helpers", () => {
  it("uses chrome storage when the browser namespace is unavailable", async () => {
    const storedConfiguration: LLMConfiguration = {
      enabled: true,
      provider: "openai",
      endpoint: "https://api.example.com/v1/llm",
      apiKey: "token",
      model: "model-v1"
    };

    const storageState: Record<string, unknown> = {
      [LLM_CONFIGURATION_STORAGE_KEY]: storedConfiguration
    };

    let getKey: string | string[] | Record<string, unknown> | undefined;

    extensionGlobals.chrome = {
      storage: {
        local: {
          async get(key) {
            getKey = key;
            return { ...storageState };
          },
          async set(items) {
            Object.assign(storageState, items);
          }
        }
      }
    };

    const retrieved = await getItem(LLM_CONFIGURATION_STORAGE_KEY);

    assert.deepStrictEqual(retrieved, storedConfiguration);
    assert.strictEqual(getKey, LLM_CONFIGURATION_STORAGE_KEY);

    const updatedConfiguration: LLMConfiguration = {
      ...storedConfiguration,
      enabled: false
    };

    await setItem(LLM_CONFIGURATION_STORAGE_KEY, updatedConfiguration);

    assert.deepStrictEqual(storageState[LLM_CONFIGURATION_STORAGE_KEY], updatedConfiguration);
  });

  it("normalizes stored configuration values when loading and persists saves", async () => {
    const storageState: Record<string, unknown> = {
      [LLM_CONFIGURATION_STORAGE_KEY]: {
        enabled: 0,
        endpoint: 123,
        apiKey: null,
        model: 99
      }
    };

    const setCalls: Record<string, unknown>[] = [];

    extensionGlobals.browser = {
      storage: {
        local: {
          async get(key) {
            assert.strictEqual(key, LLM_CONFIGURATION_STORAGE_KEY);
            return { ...storageState };
          },
          async set(items) {
            setCalls.push(items);
            Object.assign(storageState, items);
          }
        }
      }
    };

    const loaded = await loadLLMConfiguration();

    assert.deepStrictEqual(loaded, {
      enabled: false,
      provider: "openai",
      endpoint: "",
      apiKey: "",
      model: ""
    });

    const configurationToSave: LLMConfiguration = {
      enabled: true,
      provider: "openai",
      endpoint: "https://api.example.com/v1/llm",
      apiKey: "token",
      model: "model-v2"
    };

    await saveLLMConfiguration(configurationToSave);

    assert.strictEqual(setCalls.length, 1);
    assert.deepStrictEqual(setCalls[0], {
      [LLM_CONFIGURATION_STORAGE_KEY]: configurationToSave
    });
    assert.deepStrictEqual(storageState[LLM_CONFIGURATION_STORAGE_KEY], configurationToSave);
  });
});
