import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decryptBookmarkSnapshot,
  encryptBookmarkSnapshot
} from "../bookmark-snapshot-crypto";
import type { BookmarkSnapshot } from "../../models/bookmark-snapshot";

type CompressionConstructor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type DecompressionConstructor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

const globalCompression = globalThis as {
  CompressionStream?: CompressionConstructor;
  DecompressionStream?: DecompressionConstructor;
};

const originalCompressionStream = globalCompression.CompressionStream;
const originalDecompressionStream = globalCompression.DecompressionStream;

function createSnapshot(): BookmarkSnapshot {
  return {
    merged: [
      {
        id: "merged-sample-1",
        title: "Sample",
        url: "https://sample.test",
        tags: ["sample"],
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    categorized: [
      {
        id: "categorized-sample-1",
        title: "Sample",
        url: "https://sample.test",
        tags: ["sample"],
        createdAt: "2024-01-01T00:00:00.000Z",
        category: "testing"
      }
    ]
  };
}

afterEach(() => {
  globalCompression.CompressionStream = originalCompressionStream;
  globalCompression.DecompressionStream = originalDecompressionStream;
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

    const decrypted = await decryptBookmarkSnapshot(encrypted, {
      keySource: "user",
      secret: "fallback-secret"
    });

    assert.deepStrictEqual(decrypted, snapshot);
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

    const decrypted = await decryptBookmarkSnapshot(encrypted, {
      keySource: "platform"
    });

    assert.deepStrictEqual(decrypted, snapshot);
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
