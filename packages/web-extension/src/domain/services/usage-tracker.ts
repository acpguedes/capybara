import type {
  BookmarkUsageStats,
  UsageEvent,
  UsageEventType
} from "../models/usage-event";
import { USAGE_EVENTS_STORAGE_KEY } from "../models/usage-event";
import { getItem, setItem } from "./extension-storage";

const MAX_EVENTS_PER_BOOKMARK = 100;

export async function loadUsageEvents(): Promise<UsageEvent[]> {
  const stored = await getItem(USAGE_EVENTS_STORAGE_KEY);
  if (!stored) return [];
  return stored;
}

export async function saveUsageEvents(
  events: UsageEvent[]
): Promise<void> {
  await setItem(USAGE_EVENTS_STORAGE_KEY, events);
}

export async function recordUsageEvent(
  bookmarkId: string,
  eventType: UsageEventType
): Promise<void> {
  const events = await loadUsageEvents();

  const newEvent: UsageEvent = {
    bookmarkId,
    eventType,
    timestamp: new Date().toISOString()
  };

  events.push(newEvent);

  const bookmarkEvents = events.filter(
    (e) => e.bookmarkId === bookmarkId
  );

  if (bookmarkEvents.length > MAX_EVENTS_PER_BOOKMARK) {
    const excess = bookmarkEvents.length - MAX_EVENTS_PER_BOOKMARK;
    let removed = 0;
    const pruned = events.filter((e) => {
      if (e.bookmarkId === bookmarkId && removed < excess) {
        removed++;
        return false;
      }
      return true;
    });
    await saveUsageEvents(pruned);
  } else {
    await saveUsageEvents(events);
  }
}

export function computeUsageStats(
  events: UsageEvent[]
): Map<string, BookmarkUsageStats> {
  const statsMap = new Map<string, BookmarkUsageStats>();

  for (const event of events) {
    const existing = statsMap.get(event.bookmarkId);

    if (existing) {
      existing.totalAccesses += 1;
      existing.accessHistory.push(event);

      if (event.timestamp > existing.lastAccessedAt) {
        existing.lastAccessedAt = event.timestamp;
      }
    } else {
      statsMap.set(event.bookmarkId, {
        bookmarkId: event.bookmarkId,
        totalAccesses: 1,
        lastAccessedAt: event.timestamp,
        accessHistory: [event]
      });
    }
  }

  return statsMap;
}

export function getTopBookmarks(
  stats: Map<string, BookmarkUsageStats>,
  limit: number = 10
): BookmarkUsageStats[] {
  return Array.from(stats.values())
    .sort((a, b) => b.totalAccesses - a.totalAccesses)
    .slice(0, limit);
}

export function getRecentlyAccessed(
  stats: Map<string, BookmarkUsageStats>,
  limit: number = 10
): BookmarkUsageStats[] {
  return Array.from(stats.values())
    .sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))
    .slice(0, limit);
}
