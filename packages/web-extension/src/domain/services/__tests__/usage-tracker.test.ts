import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UsageEvent } from "../../models/usage-event";
import {
  computeUsageStats,
  getTopBookmarks,
  getRecentlyAccessed
} from "../usage-tracker";

function makeEvent(
  bookmarkId: string,
  timestamp: string,
  eventType: "click" | "search-hit" | "preview" = "click"
): UsageEvent {
  return { bookmarkId, eventType, timestamp };
}

describe("computeUsageStats", () => {
  it("returns empty map for no events", () => {
    const stats = computeUsageStats([]);
    assert.strictEqual(stats.size, 0);
  });

  it("computes stats for a single bookmark", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b1", "2024-01-02T00:00:00.000Z"),
      makeEvent("b1", "2024-01-03T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);

    assert.strictEqual(stats.size, 1);
    const b1Stats = stats.get("b1");
    assert.ok(b1Stats, "expected stats for b1");
    assert.strictEqual(b1Stats!.totalAccesses, 3);
    assert.strictEqual(b1Stats!.lastAccessedAt, "2024-01-03T00:00:00.000Z");
    assert.strictEqual(b1Stats!.accessHistory.length, 3);
  });

  it("computes stats across multiple bookmarks", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-02T00:00:00.000Z"),
      makeEvent("b1", "2024-01-03T00:00:00.000Z"),
      makeEvent("b3", "2024-01-04T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);

    assert.strictEqual(stats.size, 3);
    assert.strictEqual(stats.get("b1")?.totalAccesses, 2);
    assert.strictEqual(stats.get("b2")?.totalAccesses, 1);
    assert.strictEqual(stats.get("b3")?.totalAccesses, 1);
  });

  it("tracks the most recent access timestamp", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-03T00:00:00.000Z"),
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b1", "2024-01-05T00:00:00.000Z"),
      makeEvent("b1", "2024-01-02T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);
    const b1Stats = stats.get("b1");
    assert.ok(b1Stats, "expected stats for b1");
    assert.strictEqual(b1Stats!.lastAccessedAt, "2024-01-05T00:00:00.000Z");
  });
});

describe("getTopBookmarks", () => {
  it("returns bookmarks sorted by access count", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-02T00:00:00.000Z"),
      makeEvent("b3", "2024-01-01T00:00:00.000Z"),
      makeEvent("b3", "2024-01-02T00:00:00.000Z"),
      makeEvent("b3", "2024-01-03T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);
    const top = getTopBookmarks(stats, 2);

    assert.strictEqual(top.length, 2);
    assert.strictEqual(top[0].bookmarkId, "b3");
    assert.strictEqual(top[1].bookmarkId, "b2");
  });

  it("respects the limit parameter", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-01T00:00:00.000Z"),
      makeEvent("b3", "2024-01-01T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);
    const top = getTopBookmarks(stats, 1);

    assert.strictEqual(top.length, 1);
  });
});

describe("getRecentlyAccessed", () => {
  it("returns bookmarks sorted by most recent access", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-03T00:00:00.000Z"),
      makeEvent("b3", "2024-01-02T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);
    const recent = getRecentlyAccessed(stats);

    assert.strictEqual(recent[0].bookmarkId, "b2");
    assert.strictEqual(recent[1].bookmarkId, "b3");
    assert.strictEqual(recent[2].bookmarkId, "b1");
  });

  it("respects the limit parameter", () => {
    const events: UsageEvent[] = [
      makeEvent("b1", "2024-01-01T00:00:00.000Z"),
      makeEvent("b2", "2024-01-02T00:00:00.000Z"),
      makeEvent("b3", "2024-01-03T00:00:00.000Z")
    ];

    const stats = computeUsageStats(events);
    const recent = getRecentlyAccessed(stats, 2);

    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0].bookmarkId, "b3");
  });
});
