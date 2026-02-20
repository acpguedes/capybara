import Dexie, { type Table } from "dexie";
import type { LLMProviderType } from "../models/llm-provider";

// ===== BOOKMARK STATUS (lifecycle) =====
export type BookmarkStatus = "active" | "archived" | "removed";

// ===== LINK STATUS (health check) =====
export type LinkStatus =
  | "unchecked"
  | "alive"
  | "redirected"
  | "broken"
  | "timeout";

// ===== CLASSIFICATION SOURCE =====
export type ClassificationSource = "user" | "llm" | "heuristic";

// ===== CATEGORY STATUS =====
export type CategoryStatus = "active" | "archived" | "merged";

// ═══════════════════════════════════════════════════════════════
// BOOKMARKS — the central record for each saved URL
// ═══════════════════════════════════════════════════════════════
export interface BookmarkRecord {
  id: string;
  url: string;
  title: string;
  description: string;
  notes: string;
  favicon: string;

  status: BookmarkStatus;
  linkStatus: LinkStatus;
  linkFinalUrl: string | null;
  linkStatusCode: number | null;

  tags: string[];
  categoryId: string | null;
  categorySource: ClassificationSource;
  categoryConfidence: number | null;

  sourceBrowsers: string[];
  sourceBookmarkIds: string[];
  importedFrom: string | null;

  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  removedAt: string | null;
  lastVisitedAt: string | null;
  linkCheckedAt: string | null;
  categorizedAt: string | null;
  importedAt: string;
  syncedAt: string | null;

  _rev: number;
  _deleted: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIES — classification buckets (user or AI managed)
// ═══════════════════════════════════════════════════════════════
export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  color: string | null;
  icon: string | null;

  status: CategoryStatus;
  source: ClassificationSource;
  mergedIntoCategoryId: string | null;

  parentId: string | null;
  sortOrder: number;

  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;

  _rev: number;
  _deleted: boolean;
}

// ═══════════════════════════════════════════════════════════════
// RECLASSIFICATION HISTORY — audit trail for category changes
// ═══════════════════════════════════════════════════════════════
export interface ReclassificationRecord {
  id: string;
  bookmarkId: string;

  previousCategoryId: string | null;
  newCategoryId: string | null;
  previousTags: string[];
  newTags: string[];

  source: ClassificationSource;
  reason: string | null;
  confidence: number | null;

  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
// LINK CHECKS — log of URL validation attempts
// ═══════════════════════════════════════════════════════════════
export interface LinkCheckRecord {
  id: string;
  bookmarkId: string;
  url: string;

  status: LinkStatus;
  httpStatusCode: number | null;
  finalUrl: string | null;
  responseTimeMs: number | null;
  errorMessage: string | null;

  checkedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// USER PREFERENCES — singleton configuration record
// ═══════════════════════════════════════════════════════════════
export interface UserPreferences {
  id: "singleton";

  syncEnabled: boolean;
  syncSecret: string | undefined;
  syncKeySource: "user" | "platform";

  llmEnabled: boolean;
  llmProvider: LLMProviderType;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;

  linkCheckEnabled: boolean;
  linkCheckIntervalHours: number;

  defaultView: "all" | "active" | "archived";
  showBrokenLinks: boolean;

  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// SYNC CURSOR — tracks sync progress with cloud
// ═══════════════════════════════════════════════════════════════
export interface SyncCursor {
  id: "singleton";
  lastPulledRev: number;
  lastPushedRev: number;
  lastSyncTimestamp: string;
  syncState: "idle" | "pushing" | "pulling" | "error";
  errorMessage: string | null;
  consecutiveFailures: number;
}

// ═══════════════════════════════════════════════════════════════
// DATABASE DEFINITION
// ═══════════════════════════════════════════════════════════════
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
