import type { Bookmark } from "./bookmark";
import type { CategorizedBookmark } from "./categorized-bookmark";
import type { SyncKeySource } from "./sync-settings";

export interface BookmarkSnapshot {
  merged?: Bookmark[];
  categorized?: CategorizedBookmark[];
}

export const BOOKMARK_SNAPSHOT_STORAGE_KEY = "bookmarkSnapshot";

export interface PlainBookmarkSnapshotPayload {
  version: 1;
  kind: "plain";
  snapshot: BookmarkSnapshot;
}

export interface EncryptedBookmarkSnapshotPayload {
  version: 1;
  kind: "encrypted";
  algorithm: "AES-GCM";
  compression: "gzip";
  keySource: SyncKeySource;
  iv: string;
  salt: string;
  ciphertext: string;
}

export type BookmarkSnapshotStorageValue =
  | BookmarkSnapshot
  | PlainBookmarkSnapshotPayload
  | EncryptedBookmarkSnapshotPayload;
