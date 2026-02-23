import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  searchBookmarks,
  setSearchSyncSettingsLoader,
  resetSearchSyncSettingsLoader
} from "../search";
import type { CategorizedBookmark } from "../../models/categorized-bookmark";

afterEach(() => {
  searchBookmarks.index([], []);
  resetSearchSyncSettingsLoader();
});

function makeBookmark(
  overrides: Partial<CategorizedBookmark> & { id: string }
): CategorizedBookmark {
  return {
    title: "Test Bookmark",
    url: "https://example.com",
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    source: "chromium",
    category: "uncategorized",
    ...overrides
  };
}

describe("scoredQuery", () => {
  it("returns all items with score 0 for empty query", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", title: "Alpha" }),
      makeBookmark({ id: "b2", title: "Beta" })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("");

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].score, 0);
    assert.strictEqual(results[1].score, 0);
  });

  it("ranks exact title matches highest", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", title: "TypeScript Guide" }),
      makeBookmark({ id: "b2", title: "A TypeScript Guide for Beginners" }),
      makeBookmark({
        id: "b3",
        title: "JavaScript",
        url: "https://typescript.org"
      })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("TypeScript Guide");

    assert.ok(results.length > 0);
    assert.strictEqual(results[0].bookmark.id, "b1");
    assert.ok(results[0].score > results[1].score);
  });

  it("considers tags in scoring", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        title: "Some Article",
        tags: ["rust"],
        url: "https://example.com/article"
      }),
      makeBookmark({
        id: "b2",
        title: "Rust Programming Language",
        url: "https://rust-lang.org"
      })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("rust");

    assert.ok(results.length === 2);
    const b1Result = results.find((r) => r.bookmark.id === "b1");
    const b2Result = results.find((r) => r.bookmark.id === "b2");
    assert.ok(b1Result, "expected b1 in results");
    assert.ok(b2Result, "expected b2 in results");
    assert.ok(b1Result!.score > 0);
    assert.ok(b2Result!.score > 0);
  });

  it("considers category in scoring", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        title: "Random Article",
        category: "programming"
      }),
      makeBookmark({
        id: "b2",
        title: "Another Article",
        category: "cooking"
      })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("programming");

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].bookmark.id, "b1");
  });

  it("excludes non-matching bookmarks", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", title: "Alpha" }),
      makeBookmark({ id: "b2", title: "Beta" })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("Gamma");

    assert.strictEqual(results.length, 0);
  });

  it("handles multi-word queries by scoring word matches", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", title: "React TypeScript Tutorial" }),
      makeBookmark({ id: "b2", title: "React Basics" }),
      makeBookmark({ id: "b3", title: "TypeScript Handbook" })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("React TypeScript");

    assert.ok(results.length > 0);
    assert.strictEqual(results[0].bookmark.id, "b1");
  });

  it("is case-insensitive", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", title: "CAPYBARA Bookmarks" })
    ];
    searchBookmarks.index(bookmarks);

    const results = searchBookmarks.scoredQuery("capybara");

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].score > 0);
  });
});

describe("getItemCount", () => {
  it("returns the number of indexed items", () => {
    const bookmarks = [
      makeBookmark({ id: "b1" }),
      makeBookmark({ id: "b2" }),
      makeBookmark({ id: "b3" })
    ];
    searchBookmarks.index(bookmarks);

    assert.strictEqual(searchBookmarks.getItemCount(), 3);
  });

  it("returns 0 when no items indexed", () => {
    assert.strictEqual(searchBookmarks.getItemCount(), 0);
  });
});
