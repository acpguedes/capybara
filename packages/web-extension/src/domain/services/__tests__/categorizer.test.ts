import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Bookmark } from "../../models/bookmark";
import { categorizeBookmarks } from "../categorizer";

describe("categorizeBookmarks", () => {
  it("prefers the first tag when available", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "bookmark-1",
        title: "A guide to sourdough",
        url: "https://bread.example.com/guide",
        tags: ["baking", "food"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const categorized = categorizeBookmarks(bookmarks);

    assert.strictEqual(categorized[0].category, "baking");
  });

  it("falls back to the hostname when tags are missing", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "bookmark-2",
        title: "Infrastructure patterns",
        url: "https://engineering.example.org/posts/1",
        tags: [],
        createdAt: "2024-01-02T00:00:00.000Z",
        source: "firefox"
      }
    ];

    const categorized = categorizeBookmarks(bookmarks);

    assert.strictEqual(categorized[0].category, "example.org");
  });

  it("marks bookmarks as uncategorized when parsing fails", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "bookmark-3",
        title: "Broken link",
        url: "not-a-valid-url",
        tags: [],
        createdAt: "2024-01-03T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const categorized = categorizeBookmarks(bookmarks);

    assert.strictEqual(categorized[0].category, "uncategorized");
  });
});
