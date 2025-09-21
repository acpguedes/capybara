import type {
  BookmarkSnapshot,
  BookmarkSnapshotStorageValue,
  EncryptedBookmarkSnapshotPayload,
  PlainBookmarkSnapshotPayload
} from "../models/bookmark-snapshot";
import type { SyncKeySource } from "../models/sync-settings";

export interface BookmarkSnapshotEncryptionContext {
  keySource: SyncKeySource;
  secret?: string;
}

const ENCRYPTION_ALGORITHM = "AES-GCM";
const COMPRESSION_FORMAT = "gzip";
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function toBase64(bytes: Uint8Array): string {
  const nodeBuffer = (globalThis as { Buffer?: any }).Buffer;

  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  throw new Error("Unable to encode base64");
}

function fromBase64(value: string): Uint8Array {
  const nodeBuffer = (globalThis as { Buffer?: any }).Buffer;

  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(value, "base64"));
  }

  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  throw new Error("Unable to decode base64");
}

function getPlatformSecret(): string {
  if (typeof navigator !== "undefined") {
    const platform = navigator.platform ?? "";
    const language = navigator.language ?? "";
    return `${navigator.userAgent}::${platform}::${language}`;
  }

  const nodeProcess = (globalThis as {
    process?: { platform?: string; arch?: string; version?: string };
  }).process;

  if (nodeProcess) {
    const platform = nodeProcess.platform ?? "";
    const arch = nodeProcess.arch ?? "";
    const version = nodeProcess.version ?? "";
    return `${platform}::${arch}::${version}`;
  }

  return "capybara::platform";
}

function toBufferSource(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

async function deriveKey(
  context: BookmarkSnapshotEncryptionContext,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const secret =
    context.keySource === "user"
      ? context.secret?.trim()
      : getPlatformSecret();

  if (!secret || secret.length === 0) {
    throw new Error("Unable to derive encryption key without a secret");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function compress(payload: string): Promise<Uint8Array> {
  const stream = new Blob([payload]).stream().pipeThrough(
    new CompressionStream(COMPRESSION_FORMAT)
  );
  const response = new Response(stream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

async function decompress(payload: Uint8Array): Promise<string> {
  const sliced = payload.buffer.slice(
    payload.byteOffset,
    payload.byteOffset + payload.byteLength
  ) as ArrayBuffer;
  const stream = new Blob([sliced]).stream().pipeThrough(
    new DecompressionStream(COMPRESSION_FORMAT)
  );
  const response = new Response(stream);
  return response.text();
}

export async function encryptBookmarkSnapshot(
  snapshot: BookmarkSnapshot,
  context: BookmarkSnapshotEncryptionContext
): Promise<EncryptedBookmarkSnapshotPayload> {
  const serialized = JSON.stringify(snapshot);
  const compressed = await compress(serialized);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(context, salt);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ENCRYPTION_ALGORITHM,
      iv: toBufferSource(iv)
    },
    key,
    toBufferSource(compressed)
  );

  return {
    version: 1,
    kind: "encrypted",
    algorithm: ENCRYPTION_ALGORITHM,
    compression: COMPRESSION_FORMAT,
    keySource: context.keySource,
    iv: toBase64(iv),
    salt: toBase64(salt),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptBookmarkSnapshot(
  stored: BookmarkSnapshotStorageValue,
  context: BookmarkSnapshotEncryptionContext | null
): Promise<BookmarkSnapshot | null> {
  if (!stored) {
    return null;
  }

  if (!stored || typeof stored !== "object") {
    return null;
  }

  if (!("kind" in stored)) {
    return stored as BookmarkSnapshot;
  }

  const payload = stored as PlainBookmarkSnapshotPayload | EncryptedBookmarkSnapshotPayload;

  if (payload.kind === "plain") {
    return payload.snapshot ?? null;
  }

  if (payload.kind === "encrypted") {
    if (!context || payload.keySource !== context.keySource) {
      throw new Error("Unable to decrypt bookmark snapshot with the provided context");
    }

    const iv = fromBase64(payload.iv);
    const salt = fromBase64(payload.salt);
    const ciphertext = fromBase64(payload.ciphertext);

    const key = await deriveKey(context, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: toBufferSource(iv)
      },
      key,
      toBufferSource(ciphertext)
    );

    const decompressed = await decompress(new Uint8Array(decrypted));
    return JSON.parse(decompressed) as BookmarkSnapshot;
  }

  return null;
}
