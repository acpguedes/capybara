import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CategorizedBookmark } from "../../models/categorized-bookmark";
import { discoverRelations } from "../relation-discovery";

function makeBookmark(
  overrides: Partial<CategorizedBookmark> & { id: string; url: string }
): CategorizedBookmark {
  return {
    title: "Test Bookmark",
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    source: "chromium",
    category: "uncategorized",
    ...overrides
  };
}

describe("discoverRelations", () => {
  it("returns empty array for a single bookmark", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", url: "https://example.com/page" })
    ];

    const relations = discoverRelations(bookmarks);

    assert.strictEqual(relations.length, 0);
  });

  it("discovers same-domain relations between bookmarks on the same host", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", url: "https://example.com/page1" }),
      makeBookmark({ id: "b2", url: "https://example.com/page2" })
    ];

    const relations = discoverRelations(bookmarks);

    assert.ok(relations.length > 0);
    const domainRelation = relations.find(
      (r) => r.relationType === "same-domain"
    );
    assert.ok(domainRelation, "expected a same-domain relation");
    assert.strictEqual(domainRelation!.sourceBookmarkId, "b1");
    assert.strictEqual(domainRelation!.targetBookmarkId, "b2");
    assert.strictEqual(domainRelation!.strength, 0.6);
  });

  it("discovers same-category relations between bookmarks in the same category", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        url: "https://alpha.com/page",
        category: "programming"
      }),
      makeBookmark({
        id: "b2",
        url: "https://beta.com/page",
        category: "programming"
      })
    ];

    const relations = discoverRelations(bookmarks);

    assert.ok(relations.length > 0);
    const categoryRelation = relations.find(
      (r) => r.relationType === "same-category"
    );
    assert.ok(categoryRelation, "expected a same-category relation");
    assert.strictEqual(categoryRelation!.strength, 0.5);
  });

  it("ignores uncategorized bookmarks for category relations", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        url: "https://alpha.com/page",
        category: "uncategorized"
      }),
      makeBookmark({
        id: "b2",
        url: "https://beta.com/page",
        category: "uncategorized"
      })
    ];

    const relations = discoverRelations(bookmarks);

    const categoryRelations = relations.filter(
      (r) => r.relationType === "same-category"
    );
    assert.strictEqual(categoryRelations.length, 0);
  });

  it("boosts strength when bookmarks share both domain and category", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        url: "https://example.com/page1",
        category: "docs"
      }),
      makeBookmark({
        id: "b2",
        url: "https://example.com/page2",
        category: "docs"
      })
    ];

    const relations = discoverRelations(bookmarks);

    assert.ok(relations.length > 0);
    const strongest = relations.reduce((a, b) =>
      a.strength > b.strength ? a : b
    );
    assert.ok(strongest.strength >= 0.6);
  });

  it("does not create duplicate pairs", () => {
    const bookmarks = [
      makeBookmark({
        id: "b1",
        url: "https://example.com/page1",
        category: "tech"
      }),
      makeBookmark({
        id: "b2",
        url: "https://example.com/page2",
        category: "tech"
      })
    ];

    const relations = discoverRelations(bookmarks);

    const pairs = relations.map(
      (r) => `${r.sourceBookmarkId}::${r.targetBookmarkId}`
    );
    const uniquePairs = new Set(pairs);
    assert.strictEqual(pairs.length, uniquePairs.size);
  });

  it("handles bookmarks with invalid URLs gracefully", () => {
    const bookmarks = [
      makeBookmark({ id: "b1", url: "not-a-url", category: "docs" }),
      makeBookmark({
        id: "b2",
        url: "https://example.com/page",
        category: "docs"
      })
    ];

    const relations = discoverRelations(bookmarks);

    assert.ok(Array.isArray(relations));
  });
});
