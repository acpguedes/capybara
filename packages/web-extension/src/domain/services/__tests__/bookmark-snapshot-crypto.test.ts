import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decryptBookmarkSnapshot,
  encryptBookmarkSnapshot
} from "../bookmark-snapshot-crypto";
import type {
  BookmarkSnapshot,
  EncryptedBookmarkSnapshotPayload
} from "../../models/bookmark-snapshot";

type CompressionConstructor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type DecompressionConstructor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type MockStorageArea = {
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type TestNavigator = Partial<Navigator> & {
  userAgent?: string;
  platform?: string;
  language?: string;
};

type ExtensionGlobals = Omit<typeof globalThis, "browser" | "navigator"> & {
  browser?: { storage?: { local?: MockStorageArea } };
  navigator?: TestNavigator;
};

const globalCompression = globalThis as {
  CompressionStream?: CompressionConstructor;
  DecompressionStream?: DecompressionConstructor;
};

const originalCompressionStream = globalCompression.CompressionStream;
const originalDecompressionStream = globalCompression.DecompressionStream;
const extensionGlobals = globalThis as ExtensionGlobals;
const originalBrowser = extensionGlobals.browser;
type NavigatorMockHelper = {
  navigatorMock: TestNavigator;
  define(overrides?: Partial<TestNavigator>): void;
  restore(): void;
};

function createNavigatorMockHelper(): NavigatorMockHelper {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  const defaults: Required<Pick<TestNavigator, "userAgent" | "platform" | "language">> = {
    userAgent: "TestBrowser/1.0",
    platform: "TestOS",
    language: "en-US"
  };

  const navigatorMock: TestNavigator = { ...defaults };

  return {
    navigatorMock,
    define(overrides: Partial<TestNavigator> = {}) {
      navigatorMock.userAgent = overrides.userAgent ?? defaults.userAgent;
      navigatorMock.platform = overrides.platform ?? defaults.platform;
      navigatorMock.language = overrides.language ?? defaults.language;

      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: navigatorMock
      });
    },
    restore() {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "navigator", originalDescriptor);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
    }
  };
}

const navigatorMockHelper = createNavigatorMockHelper();
const PLATFORM_SECRET_STORAGE_KEY = "bookmarkSnapshotPlatformSecret";

function createSnapshot(): BookmarkSnapshot {
  return {
    merged: [
      {
        id: "merged-sample-1",
        title: "Sample",
        url: "https://sample.test",
        tags: ["sample"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ],
    categorized: [
      {
        id: "categorized-sample-1",
        title: "Sample",
        url: "https://sample.test",
        tags: ["sample"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium",
        category: "testing"
      }
    ]
  };
}

afterEach(() => {
  globalCompression.CompressionStream = originalCompressionStream;
  globalCompression.DecompressionStream = originalDecompressionStream;

  extensionGlobals.browser = originalBrowser;
  navigatorMockHelper.restore();
});

describe("bookmark snapshot crypto compression handling", () => {
  it("falls back to storing uncompressed data when streams are unavailable", async () => {
    globalCompression.CompressionStream = undefined;
    globalCompression.DecompressionStream = undefined;

    const snapshot = createSnapshot();

    const encrypted = await encryptBookmarkSnapshot(snapshot, {
      keySource: "user",
      secret: "fallback-secret"
    });

    assert.strictEqual(encrypted.compression, "none");

    const result = await decryptBookmarkSnapshot(encrypted, {
      keySource: "user",
      secret: "fallback-secret"
    });

    assert.deepStrictEqual(result.snapshot, snapshot);
    assert.strictEqual(result.migratedPayload, null);
  });

  it("uses native compression streams when they are available", async () => {
    class PassThroughCompressionStream {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor(format: string) {
        assert.strictEqual(format, "gzip");
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          }
        });
        this.readable = readable;
        this.writable = writable;
      }
    }

    class PassThroughDecompressionStream {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor(format: string) {
        assert.strictEqual(format, "gzip");
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          }
        });
        this.readable = readable;
        this.writable = writable;
      }
    }

    globalCompression.CompressionStream = PassThroughCompressionStream;
    globalCompression.DecompressionStream = PassThroughDecompressionStream;

    const snapshot = createSnapshot();

    const encrypted = await encryptBookmarkSnapshot(snapshot, {
      keySource: "platform"
    });

    assert.strictEqual(encrypted.compression, "gzip");

    const result = await decryptBookmarkSnapshot(encrypted, {
      keySource: "platform"
    });

    assert.deepStrictEqual(result.snapshot, snapshot);
    assert.strictEqual(result.migratedPayload, null);
  });

  it("fails to decrypt gzip snapshots when decompression support is missing", async () => {
    class PassThroughCompressionStream {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor(format: string) {
        assert.strictEqual(format, "gzip");
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          }
        });
        this.readable = readable;
        this.writable = writable;
      }
    }

    class PassThroughDecompressionStream {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor(format: string) {
        assert.strictEqual(format, "gzip");
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          }
        });
        this.readable = readable;
        this.writable = writable;
      }
    }

    globalCompression.CompressionStream = PassThroughCompressionStream;
    globalCompression.DecompressionStream = PassThroughDecompressionStream;

    const snapshot = createSnapshot();

    const encrypted = await encryptBookmarkSnapshot(snapshot, {
      keySource: "platform"
    });

    globalCompression.CompressionStream = undefined;
    globalCompression.DecompressionStream = undefined;

    let thrown: unknown;

    try {
      await decryptBookmarkSnapshot(encrypted, {
        keySource: "platform"
      });
    } catch (error) {
      thrown = error;
    }

    if (!thrown) {
      throw new Error(
        "expected decryptBookmarkSnapshot to throw when gzip decompression is unavailable"
      );
    }

    assert.ok(thrown instanceof Error);

    if (thrown instanceof Error) {
      assert.ok(/gzip compression is not supported/.test(thrown.message));
    }
  });
});

describe("bookmark snapshot crypto platform secret migration", () => {
  it("migrates legacy platform snapshots to a persistent secret", async () => {
    const storageData: Record<string, unknown> = {};

    extensionGlobals.browser = {
      storage: {
        local: {
          async get(key) {
            if (typeof key === "string") {
              if (Object.prototype.hasOwnProperty.call(storageData, key)) {
                return { [key]: storageData[key] };
              }
              return {};
            }

            if (Array.isArray(key)) {
              const result: Record<string, unknown> = {};
              for (const entry of key) {
                if (Object.prototype.hasOwnProperty.call(storageData, entry)) {
                  result[entry] = storageData[entry];
                }
              }
              return result;
            }

            return {};
          },
          async set(items) {
            Object.assign(storageData, items);
          }
        }
      }
    };

    navigatorMockHelper.define({
      userAgent: "TestBrowser/1.0",
      platform: "TestOS",
      language: "en-US"
    });

    const snapshot = createSnapshot();

    const navigatorMock = navigatorMockHelper.navigatorMock;
    const legacySecret = `${navigatorMock.userAgent ?? ""}::${navigatorMock.platform ?? ""}::${navigatorMock.language ?? ""}`;

    const legacyEncrypted = await encryptBookmarkSnapshot(snapshot, {
      keySource: "user",
      secret: legacySecret
    });

    const legacyPayload: EncryptedBookmarkSnapshotPayload = {
      ...legacyEncrypted,
      keySource: "platform"
    };

    const result = await decryptBookmarkSnapshot(legacyPayload, {
      keySource: "platform"
    });

    assert.deepStrictEqual(result.snapshot, snapshot);

    const migrated = result.migratedPayload;

    if (!migrated) {
      throw new Error("expected the snapshot to be re-encrypted with the persistent secret");
    }

    const storedSecret = storageData[PLATFORM_SECRET_STORAGE_KEY];
    assert.strictEqual(typeof storedSecret, "string");

    assert.strictEqual(migrated.keySource, "platform");

    navigatorMock.userAgent = "TestBrowser/2.0";

    const migratedResult = await decryptBookmarkSnapshot(migrated, {
      keySource: "platform"
    });

    assert.deepStrictEqual(migratedResult.snapshot, snapshot);
    assert.strictEqual(migratedResult.migratedPayload, null);
    assert.strictEqual(storageData[PLATFORM_SECRET_STORAGE_KEY], storedSecret);
  });
});
