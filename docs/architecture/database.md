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

### Enums and Value Types

```typescript
// ===== BOOKMARK STATUS (lifecycle) =====
// Tracks the user-facing state of a bookmark in the library.
type BookmarkStatus =
  | "active"       // Normal state — visible in search, synced
  | "archived"     // User chose to hide it but keep the data
  | "removed";     // User deleted it — soft-deleted for sync propagation

// ===== LINK STATUS (health check) =====
// Tracks whether the destination URL is still reachable.
type LinkStatus =
  | "unchecked"    // Never validated (default for new imports)
  | "alive"        // Last check returned HTTP 2xx
  | "redirected"   // Last check returned HTTP 3xx (final URL stored in linkFinalUrl)
  | "broken"       // Last check returned HTTP 4xx/5xx or network error
  | "timeout";     // Last check timed out

// ===== CLASSIFICATION SOURCE =====
// Who assigned the value — affects trust/priority in conflict resolution.
type ClassificationSource =
  | "user"         // Explicitly set by the user (highest trust)
  | "llm"          // Assigned by AI categorization
  | "heuristic";   // Derived from tags or hostname (lowest trust)

// ===== CATEGORY STATUS =====
type CategoryStatus =
  | "active"       // In use, appears in filters and suggestions
  | "archived"     // Hidden from UI but bookmarks retain the reference
  | "merged";      // Replaced by another category (see mergedIntoCategoryId)
```

### Tables

```typescript
// ═══════════════════════════════════════════════════════════════
// BOOKMARKS — the central record for each saved URL
// ═══════════════════════════════════════════════════════════════
interface BookmarkRecord {
  id: string;                     // Deterministic hash of normalized URL
  url: string;                    // Normalized canonical URL
  title: string;
  description: string;            // User or AI-generated description
  notes: string;                  // Free-form user notes (always user-authored)
  favicon: string;                // Cached favicon URL or data-URI

  // ── Status & lifecycle ──
  status: BookmarkStatus;         // "active" | "archived" | "removed"
  linkStatus: LinkStatus;         // "unchecked" | "alive" | "redirected" | "broken" | "timeout"
  linkFinalUrl: string | null;    // If redirected, the resolved destination
  linkStatusCode: number | null;  // HTTP status code from last check (200, 301, 404…)

  // ── Classification ──
  tags: string[];                 // User-assigned tags (free-form)
  categoryId: string | null;      // FK → categories.id (null = uncategorized)
  categorySource: ClassificationSource;
  categoryConfidence: number | null; // 0.0–1.0, set by LLM, null for user/heuristic

  // ── Provenance ──
  sourceBrowsers: string[];       // ["chromium", "firefox"] — which browsers had it
  sourceBookmarkIds: string[];    // Original browser bookmark IDs (parallel to sourceBrowsers)
  importedFrom: string | null;    // "chromium" | "firefox" | "import-file" | null

  // ── Timestamps (all ISO 8601) ──
  createdAt: string;              // When first discovered/imported into Capybara
  updatedAt: string;              // Last modification to ANY field
  archivedAt: string | null;      // When status changed to "archived"
  removedAt: string | null;       // When status changed to "removed"
  lastVisitedAt: string | null;   // Last time user clicked this bookmark in Capybara
  linkCheckedAt: string | null;   // When linkStatus was last updated
  categorizedAt: string | null;   // When the current category was assigned
  importedAt: string;             // When first pulled from the source browser
  syncedAt: string | null;        // Last successful cloud sync for this record

  // ── Sync metadata ──
  _rev: number;                   // Monotonic revision counter (local)
  _deleted: boolean;              // Tombstone for sync (true after purge grace period)
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIES — classification buckets (user or AI managed)
// ═══════════════════════════════════════════════════════════════
interface CategoryRecord {
  id: string;                     // UUID
  name: string;                   // Display name (e.g. "Machine Learning")
  description: string;            // What belongs here (shown in UI and sent to LLM)
  color: string | null;           // Hex color for UI badges (e.g. "#4A90D9")
  icon: string | null;            // Emoji or icon identifier (e.g. "brain", "code")

  // ── Status & lifecycle ──
  status: CategoryStatus;         // "active" | "archived" | "merged"
  source: ClassificationSource;   // Who created it
  mergedIntoCategoryId: string | null; // If status="merged", the surviving category

  // ── Hierarchy ──
  parentId: string | null;        // FK → categories.id (null = top-level)
  sortOrder: number;              // Position within siblings (for manual reordering)

  // ── Timestamps ──
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;

  // ── Sync ──
  _rev: number;
  _deleted: boolean;
}

// ═══════════════════════════════════════════════════════════════
// RECLASSIFICATION HISTORY — audit trail for category changes
// ═══════════════════════════════════════════════════════════════
interface ReclassificationRecord {
  id: string;                     // UUID
  bookmarkId: string;             // FK → bookmarks.id

  // ── What changed ──
  previousCategoryId: string | null;
  newCategoryId: string | null;
  previousTags: string[];         // Snapshot of tags before (if changed)
  newTags: string[];              // Snapshot of tags after (if changed)

  // ── Who & why ──
  source: ClassificationSource;   // Who triggered the change
  reason: string | null;          // LLM explanation or user note
  confidence: number | null;      // LLM confidence (0.0–1.0)

  // ── When ──
  createdAt: string;              // When the reclassification happened
}

// ═══════════════════════════════════════════════════════════════
// LINK CHECKS — log of URL validation attempts
// ═══════════════════════════════════════════════════════════════
interface LinkCheckRecord {
  id: string;                     // UUID
  bookmarkId: string;             // FK → bookmarks.id
  url: string;                    // URL that was checked (may differ from bookmark if redirect)

  // ── Result ──
  status: LinkStatus;             // Result of this check
  httpStatusCode: number | null;  // HTTP response code
  finalUrl: string | null;        // Resolved URL after redirects
  responseTimeMs: number | null;  // How long the check took
  errorMessage: string | null;    // Error details if broken/timeout

  // ── When ──
  checkedAt: string;              // When the check ran
}

// ═══════════════════════════════════════════════════════════════
// USER PREFERENCES — singleton configuration record
// ═══════════════════════════════════════════════════════════════
interface UserPreferences {
  id: "singleton";

  // ── Sync settings ──
  syncEnabled: boolean;
  syncSecret: string | undefined;
  syncKeySource: "user" | "platform";

  // ── LLM settings ──
  llmEnabled: boolean;
  llmProvider: LLMProviderType;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;

  // ── Link checking ──
  linkCheckEnabled: boolean;      // Auto-validate URLs periodically
  linkCheckIntervalHours: number; // How often to re-check (default: 168 = weekly)

  // ── UI ──
  defaultView: "all" | "active" | "archived";
  showBrokenLinks: boolean;       // Highlight broken bookmarks in search

  // ── Timestamps ──
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// SYNC CURSOR — tracks sync progress with cloud
// ═══════════════════════════════════════════════════════════════
interface SyncCursor {
  id: "singleton";
  lastPulledRev: number;          // Server's last revision we received
  lastPushedRev: number;          // Our last revision sent to server
  lastSyncTimestamp: string;      // When last sync completed
  syncState: "idle" | "pushing" | "pulling" | "error";
  errorMessage: string | null;
  consecutiveFailures: number;    // For exponential backoff
}
```

### Dexie Database Definition

```typescript
import Dexie, { type Table } from "dexie";

class CapybaraDB extends Dexie {
  bookmarks!: Table<BookmarkRecord, string>;
  categories!: Table<CategoryRecord, string>;
  reclassifications!: Table<ReclassificationRecord, string>;
  linkChecks!: Table<LinkCheckRecord, string>;
  preferences!: Table<UserPreferences, string>;
  syncCursor!: Table<SyncCursor, string>;

  constructor() {
    super("capybara");

    this.version(1).stores({
      bookmarks:
        "id, url, categoryId, *tags, status, linkStatus, " +
        "[status+categoryId], [status+linkStatus], updatedAt, _rev",
      categories:
        "id, name, parentId, status, [status+sortOrder], _rev",
      reclassifications:
        "id, bookmarkId, [bookmarkId+createdAt], createdAt",
      linkChecks:
        "id, bookmarkId, [bookmarkId+checkedAt], checkedAt",
      preferences: "id",
      syncCursor: "id"
    });
  }
}

export const db = new CapybaraDB();
```

### Index Design Rationale

| Index | Purpose |
|---|---|
| `bookmarks.url` | Fast deduplication during merge |
| `bookmarks.categoryId` | Filter bookmarks by category |
| `bookmarks.*tags` | multiEntry -- find all bookmarks with a given tag |
| `bookmarks.status` | Filter active/archived/removed bookmarks |
| `bookmarks.linkStatus` | Find broken or unchecked links |
| `bookmarks.[status+categoryId]` | Compound: "active bookmarks in category X" (most common query) |
| `bookmarks.[status+linkStatus]` | Compound: "active bookmarks that are broken" |
| `bookmarks._rev` | Delta sync -- push records where `_rev > lastPushed` |
| `categories.name` | Dedup and lookup by name |
| `categories.parentId` | Traverse category hierarchy |
| `categories.[status+sortOrder]` | Compound: "active categories sorted by user order" |
| `reclassifications.[bookmarkId+createdAt]` | Audit trail per bookmark, chronological |
| `linkChecks.[bookmarkId+checkedAt]` | Check history per bookmark, chronological |

### Bookmark Lifecycle

```
                    ┌─────────────────────────────────────────────┐
                    │              BOOKMARK LIFECYCLE              │
                    └─────────────────────────────────────────────┘

  Browser API / Import                    User action
        │                                     │
        ▼                                     │
  ┌──────────┐    user archives    ┌──────────▼──┐
  │  ACTIVE  │ ──────────────────► │  ARCHIVED   │
  │          │ ◄────────────────── │             │
  └────┬─────┘    user restores    └──────┬──────┘
       │                                  │
       │   user removes                   │  user removes
       │                                  │
       ▼                                  ▼
  ┌──────────┐                     ┌─────────────┐
  │ REMOVED  │ ◄─────────────────  │  REMOVED    │
  │ (soft)   │    (same state)     │  (soft)     │
  └────┬─────┘                     └─────────────┘
       │
       │  after sync propagation + grace period
       ▼
  ┌──────────┐
  │ _deleted │   (tombstone — purged eventually)
  │  = true  │
  └──────────┘


  Link validation (independent of status):

  ┌───────────┐    HTTP 2xx     ┌─────────┐
  │ UNCHECKED │ ──────────────► │  ALIVE  │
  └─────┬─────┘                 └────┬────┘
        │                            │
        │ HTTP 3xx                   │ HTTP 4xx/5xx
        ▼                            ▼
  ┌────────────┐               ┌──────────┐
  │ REDIRECTED │               │  BROKEN  │
  │(finalUrl)  │               │          │
  └────────────┘               └──────────┘
                                     │
                          user fixes URL / link returns
                                     │
                                     ▼
                               ┌─────────┐
                               │  ALIVE  │
                               └─────────┘
```

### Category Lifecycle

```
  Created by user / LLM / heuristic
        │
        ▼
  ┌──────────┐
  │  ACTIVE  │ ◄──── user reactivates
  └────┬─────┘
       │
       ├── user archives ──────► ┌──────────┐
       │                         │ ARCHIVED │
       │                         └──────────┘
       │
       └── user merges into Y ─► ┌──────────┐
                                  │  MERGED  │  mergedIntoCategoryId = Y
                                  └──────────┘
                                       │
                 All bookmarks with this categoryId
                 are automatically reassigned to Y
```

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
