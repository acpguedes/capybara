# Database Architecture

This document describes the storage layer strategy for Capybara, covering the current implementation, its limitations, and the proposed evolution toward a structured local database with cloud sync.

## Current State

Today, Capybara persists all data through the browser extension's **key-value store** (`chrome.storage` / `browser.storage`). There is no traditional database.

### Storage Keys

| Key | Type | Area | Purpose |
|---|---|---|---|
| `bookmarkSnapshot` | `BookmarkSnapshotStorageValue` | local + sync | All bookmarks as a single serialized blob |
| `syncSettings` | `SyncSettings` | local | Sync on/off, passphrase, key source |
| `llmConfiguration` | `LLMConfiguration` | local | LLM provider, endpoint, API key |
| `bookmarkCategories` | `Category[]` | local | Discovered categories |
| `bookmarkSnapshotPlatformSecret` | `string` | local | Platform-generated encryption key |

### How It Works

```
extension-storage.ts
  getItem<K>(key) / setItem<K>(key, value)
       │                    │
  ┌────▼────┐         ┌────▼────┐
  │  local  │         │  sync   │
  │ (always)│         │(optional│
  └─────────┘         └─────────┘
```

- **Reads**: try `sync` first (if enabled), fall back to `local`.
- **Writes**: always write to `local`; also write to `sync` if enabled.
- **Encryption**: when sync is active, the bookmark snapshot is encrypted with AES-GCM (PBKDF2 key derivation, 250K iterations) before storage.
- **In-memory index**: `SearchIndex` loads the entire snapshot into RAM for substring search.

### Limitations

| Limitation | Impact |
|---|---|
| **`chrome.storage.sync` quota: ~100 KB** | Large bookmark libraries cannot sync |
| **`chrome.storage.local` quota: ~10 MB** | Eventually limits growth |
| **Single blob per key** | Every read/write touches the entire dataset |
| **No per-record queries** | All filtering is linear scan in memory |
| **Tied to browser/machine** | Data lives in one browser's storage, not in a user account |
| **No schema migration** | `version: 1` exists but no migration pipeline |
| **No reclassification history** | Category changes overwrite without audit trail |

---

## Proposed Architecture

### Goal

Centralize bookmark management **per user account**, not per machine or browser. A user should be able to:

1. Install Capybara on any browser/device.
2. Sign in (or pair the device).
3. See their full bookmark library, categories, and custom classifications.
4. Edit categories, add descriptions, reclassify bookmarks -- and have those changes propagate everywhere.

### Design Principles

- **Local-first**: the extension works fully offline. Cloud sync is additive, never required.
- **Privacy-first**: no data leaves the device unless the user explicitly enables sync.
- **Interoperable**: the same data model works across Chrome, Firefox, Edge, and future browsers.
- **Incremental migration**: the current `chrome.storage` approach remains functional during the transition.

---

## Technology Choice: Dexie.js (IndexedDB)

After evaluating SQLite WASM, PouchDB+CouchDB, Firebase, Supabase, and raw IndexedDB, the recommended local storage layer is **Dexie.js**.

| Criterion | Dexie.js | SQLite WASM | PouchDB+CouchDB | Raw IndexedDB |
|---|---|---|---|---|
| MV3 service worker | Works | Blocked (OPFS) | Works | Works |
| Bundle size | ~24 KB | ~500 KB-1 MB | ~46 KB | 0 KB |
| Query capability | Compound indexes | Full SQL | Map/reduce | Manual cursors |
| Schema migrations | Built-in | Manual | Manual | Manual |
| React integration | `useLiveQuery()` | None | None | None |
| Sync options | Dexie Cloud or custom | Custom only | CouchDB only | Custom only |
| Engineering effort | Low | High | Medium | Very High |

### Why Dexie.js

1. **Right-sized**: structured storage with indexes for search, categories, and tags without the weight of SQLite WASM.
2. **Works in MV3 service workers**: IndexedDB is available in Chrome/Firefox service workers and all extension pages.
3. **Built-in schema versioning**: declare tables and indexes, Dexie handles upgrades automatically.
4. **Reactive queries**: `useLiveQuery()` from `dexie-react-hooks` re-renders React components when data changes -- eliminates the manual `SearchIndex` class.
5. **Cross-context propagation**: changes made in the service worker automatically propagate to popup/options via `storagemutated` events.
6. **No sync lock-in**: Dexie.js is open source (Apache 2.0). Cloud sync can be added via Dexie Cloud, a custom REST API, or any backend.

### Why Not the Others

- **SQLite WASM**: OPFS (fast persistence) is blocked in MV3 service workers. Chrome cannot spawn Web Workers from service workers either. Bundle is 500 KB+.
- **PouchDB+CouchDB**: larger bundle (~46 KB), locks you into CouchDB-compatible servers, document model less natural for multi-table queries.
- **Firebase/Firestore**: SDK is ~100 KB+, vendor lock-in to Google, conflicts with privacy-first positioning.
- **Raw IndexedDB**: API is verbose and error-prone. You get the same result with Dexie minus the pain.

---

## Schema Design

### Tables

```typescript
// ===== BOOKMARKS =====
interface BookmarkRecord {
  id: string;                     // Deterministic hash of normalized URL
  url: string;                    // Normalized URL
  title: string;
  description: string;            // User or AI-generated description

  // Classification
  tags: string[];                 // User-assigned tags
  categoryId: string;             // FK → categories.id
  categorySource: "user" | "llm" | "heuristic";

  // Provenance
  sourceBrowsers: string[];       // ["chromium", "firefox"] — multi-source
  sourceBookmarkIds: string[];    // Original browser bookmark IDs

  // Timestamps
  createdAt: string;              // ISO 8601
  updatedAt: string;
  syncedAt: string | null;        // Last successful cloud sync

  // Sync metadata
  _rev: number;                   // Monotonic revision counter
  _deleted: boolean;              // Soft delete for sync tombstones
}

// ===== CATEGORIES =====
interface CategoryRecord {
  id: string;                     // UUID
  name: string;
  description: string;
  source: "user" | "llm" | "heuristic";
  parentId: string | null;        // Hierarchical categories
  createdAt: string;
  updatedAt: string;
  _rev: number;
  _deleted: boolean;
}

// ===== RECLASSIFICATION HISTORY =====
interface ReclassificationRecord {
  id: string;                     // UUID
  bookmarkId: string;             // FK → bookmarks.id
  previousCategoryId: string;
  newCategoryId: string;
  source: "user" | "llm";
  reason: string | null;          // LLM explanation or user note
  createdAt: string;
}

// ===== USER PREFERENCES =====
interface UserPreferences {
  id: "singleton";
  syncEnabled: boolean;
  syncSecret: string | undefined;
  syncKeySource: "user" | "platform";
  llmConfiguration: LLMConfiguration;
  updatedAt: string;
}

// ===== SYNC CURSOR =====
interface SyncCursor {
  id: "singleton";
  lastPulledRev: number;
  lastPushedRev: number;
  lastSyncTimestamp: string;
  syncState: "idle" | "pushing" | "pulling" | "error";
  errorMessage: string | null;
}
```

### Dexie Database Definition

```typescript
import Dexie, { type Table } from "dexie";

class CapybaraDB extends Dexie {
  bookmarks!: Table<BookmarkRecord, string>;
  categories!: Table<CategoryRecord, string>;
  reclassifications!: Table<ReclassificationRecord, string>;
  preferences!: Table<UserPreferences, string>;
  syncCursor!: Table<SyncCursor, string>;

  constructor() {
    super("capybara");

    this.version(1).stores({
      bookmarks: "id, url, categoryId, *tags, updatedAt, _rev",
      categories: "id, name, parentId, _rev",
      reclassifications: "id, bookmarkId, createdAt",
      preferences: "id",
      syncCursor: "id"
    });
  }
}

export const db = new CapybaraDB();
```

### Index Design Rationale

- **`bookmarks.url`**: fast lookup for deduplication during merge.
- **`bookmarks.categoryId`**: filter all bookmarks in a category.
- **`bookmarks.*tags`**: `multiEntry` index -- one index entry per tag, enables "find all bookmarks tagged X".
- **`bookmarks._rev`**: delta sync -- push only records where `_rev > lastPushedRev`.
- **`categories.name`**: deduplication and lookup by name.
- **`categories.parentId`**: traverse category hierarchy.
- **`reclassifications.bookmarkId`**: audit trail per bookmark.

---

## Migration Plan

### Phase 1: Introduce Dexie alongside chrome.storage (non-breaking)

1. Add `dexie` as a dependency.
2. Define the database schema (as above).
3. On extension startup, check if the Dexie DB is empty. If so:
   - Read `bookmarkSnapshot` from `chrome.storage` (decrypt if needed).
   - Import each bookmark as an individual `BookmarkRecord`.
   - Import categories from `bookmarkCategories`.
   - Import settings into `preferences`.
   - Set a `migrationVersion` flag in Dexie.
4. The migration is idempotent -- if interrupted, it re-runs on next startup.

### Phase 2: Switch all reads/writes to Dexie

1. Replace `SearchIndex` in-memory array with Dexie queries. Use `useLiveQuery()` in the popup for reactive search.
2. Replace `persistSnapshot()` with individual record writes to Dexie.
3. Update `categorizer.ts` and `llm-categorizer.ts` to read/write individual bookmark records.
4. Update settings services to use the `preferences` table.
5. Remove `chrome.storage` from the data pipeline (keep `extension-storage.ts` as a utility if needed).

### Phase 3: Add cloud sync

Introduce a sync backend. The `_rev` and `_deleted` fields make any of these options viable:

1. **Dexie Cloud** (fastest path): built-in two-way sync, user auth, conflict resolution.
2. **Custom REST API** (most control): lightweight server (Node.js + PostgreSQL) with delta sync.
3. **Supabase / PocketBase** (middle ground): managed backend with auth and real-time subscriptions.

---

## Cloud Sync Architecture

### Sync Protocol (Delta-Based)

```
Extension (Dexie)                         Cloud Server
      │                                        │
      │── POST /sync/push ──────────────────►  │
      │   { records where _rev > lastPushed }  │
      │                                        │
      │◄── 200 { serverRev } ─────────────────│
      │                                        │
      │── GET /sync/pull?since=lastPulled ──►  │
      │                                        │
      │◄── 200 { changedRecords, serverRev } ──│
      │                                        │
      │   Apply remote changes to Dexie        │
      │   Update syncCursor                    │
      └────────────────────────────────────────┘
```

### Conflict Resolution

- **Default**: last-write-wins by `updatedAt` timestamp.
- **Categories**: server-side merge (combine descriptions, keep user source over heuristic).
- **Reclassifications**: append-only, no conflicts.
- **Bookmarks**: if the same URL is edited on two devices, the most recent `updatedAt` wins. The overwritten changes are preserved in `reclassifications` for audit.

### Authentication

The cloud layer needs user identity. Options (in order of recommendation):

1. **Email + magic link / OTP**: simple, no passwords, aligns with privacy-first.
2. **OAuth** (Google, GitHub): familiar, but creates a dependency on identity providers.
3. **Device pairing** (QR code / short code): no account needed, good for technical users.

### Data Flow with Cloud Sync

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Account (Cloud)                    │
│                                                              │
│   ┌──────────┐  ┌──────────────┐  ┌───────────────────┐    │
│   │ Bookmarks│  │  Categories  │  │ Reclassifications │    │
│   └────▲─────┘  └──────▲───────┘  └────────▲──────────┘    │
└────────┼───────────────┼───────────────────┼────────────────┘
         │               │                   │
    ─────┼───────────────┼───────────────────┼─────  (sync)
         │               │                   │
  ┌──────┼───────────────┼───────────────────┼────────────┐
  │      ▼               ▼                   ▼            │
  │  Dexie.js (IndexedDB) — local-first on each device    │
  │                                                        │
  │  Device A           Device B           Device C        │
  │  (Chrome/macOS)     (Firefox/Linux)    (Edge/Windows)  │
  └────────────────────────────────────────────────────────┘
```

Each device has a full local copy in IndexedDB (via Dexie). Cloud sync pushes/pulls deltas. The user sees the same bookmarks, categories, and classifications regardless of which device they are on.

---

## Implementation Priority

| Phase | Scope | Effort |
|---|---|---|
| **Phase 1** | Add Dexie.js, migrate from chrome.storage, keep backward compat | 1-2 weeks |
| **Phase 2** | Switch all services to Dexie, reactive UI, reclassification history | 2-3 weeks |
| **Phase 3** | Cloud sync backend, auth, multi-device sync | 4-6 weeks |

Phase 1 and 2 deliver immediate value (better queries, schema migrations, audit trail) without requiring a server. Phase 3 unlocks the cross-device vision.

---

## References

- [Dexie.js Documentation](https://dexie.org/docs/)
- [Dexie Cloud](https://dexie.org/cloud/)
- [IndexedDB in Chrome Extensions (MV3)](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [chrome.storage API Limits](https://developer.chrome.com/docs/extensions/reference/api/storage)
