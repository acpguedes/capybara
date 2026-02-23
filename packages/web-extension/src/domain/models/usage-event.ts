export type UsageEventType = "click" | "search-hit" | "preview";

export interface UsageEvent {
  bookmarkId: string;
  eventType: UsageEventType;
  timestamp: string;
}

export interface BookmarkUsageStats {
  bookmarkId: string;
  totalAccesses: number;
  lastAccessedAt: string;
  accessHistory: UsageEvent[];
}

export const USAGE_EVENTS_STORAGE_KEY = "bookmarkUsageEvents";
