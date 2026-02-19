import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Bookmark } from "../../models/bookmark";
import type { Category } from "../../models/category";
import {
  buildCategorizationPrompt,
  parseCategorizationResponse,
  batchBookmarks
} from "../llm-prompt";

describe("buildCategorizationPrompt", () => {
  it("includes existing categories in the user message", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "b-1",
        title: "React Guide",
        url: "https://react.dev/learn",
        tags: ["frontend"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const categories: Category[] = [
      {
        name: "Web Development",
        description: "Frontend and backend web technologies",
        source: "llm",
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ];

    const { systemPrompt, userMessage } = buildCategorizationPrompt(bookmarks, categories);

    assert.ok(systemPrompt.includes("bookmark categorization"));
    assert.ok(userMessage.includes("Web Development"));
    assert.ok(userMessage.includes("React Guide"));
    assert.ok(userMessage.includes("react.dev"));
  });

  it("indicates no existing categories when the list is empty", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "b-1",
        title: "Test",
        url: "https://test.example.com",
        tags: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const { userMessage } = buildCategorizationPrompt(bookmarks, []);

    assert.ok(userMessage.includes("No existing categories yet"));
  });

  it("includes tags when present", () => {
    const bookmarks: Bookmark[] = [
      {
        id: "b-1",
        title: "TypeScript Handbook",
        url: "https://www.typescriptlang.org/docs",
        tags: ["typescript", "programming"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const { userMessage } = buildCategorizationPrompt(bookmarks, []);

    assert.ok(userMessage.includes("typescript"));
    assert.ok(userMessage.includes("programming"));
  });
});

describe("parseCategorizationResponse", () => {
  it("parses a valid JSON response", () => {
    const raw = JSON.stringify({
      categorizations: [
        { id: "b-1", category: "Web Development", confidence: 0.95 },
        { id: "b-2", category: "News", confidence: 0.8 }
      ],
      newCategories: [
        { name: "Web Development", description: "Web tech resources" }
      ]
    });

    const result = parseCategorizationResponse(raw);

    assert.ok(result);
    assert.strictEqual(result!.categorizations.length, 2);
    assert.strictEqual(result!.categorizations[0].category, "Web Development");
    assert.strictEqual(result!.categorizations[0].confidence, 0.95);
    assert.strictEqual(result!.newCategories.length, 1);
    assert.strictEqual(result!.newCategories[0].name, "Web Development");
  });

  it("strips markdown code block wrappers", () => {
    const raw = "```json\n" + JSON.stringify({
      categorizations: [
        { id: "b-1", category: "Test", confidence: 0.9 }
      ],
      newCategories: []
    }) + "\n```";

    const result = parseCategorizationResponse(raw);

    assert.ok(result);
    assert.strictEqual(result!.categorizations.length, 1);
    assert.strictEqual(result!.categorizations[0].category, "Test");
  });

  it("returns null for invalid JSON", () => {
    const result = parseCategorizationResponse("not valid json");
    assert.strictEqual(result, null);
  });

  it("returns null when categorizations is missing", () => {
    const raw = JSON.stringify({ newCategories: [] });
    const result = parseCategorizationResponse(raw);
    assert.strictEqual(result, null);
  });

  it("returns null when categorizations is empty", () => {
    const raw = JSON.stringify({ categorizations: [], newCategories: [] });
    const result = parseCategorizationResponse(raw);
    assert.strictEqual(result, null);
  });

  it("filters out malformed categorization entries", () => {
    const raw = JSON.stringify({
      categorizations: [
        { id: "b-1", category: "Valid", confidence: 0.9 },
        { id: "b-2" },
        { category: "Missing ID" },
        null,
        { id: "b-3", category: "", confidence: 0.5 }
      ],
      newCategories: []
    });

    const result = parseCategorizationResponse(raw);

    assert.ok(result);
    assert.strictEqual(result!.categorizations.length, 1);
    assert.strictEqual(result!.categorizations[0].id, "b-1");
  });

  it("defaults confidence to 0.5 when missing", () => {
    const raw = JSON.stringify({
      categorizations: [
        { id: "b-1", category: "Test" }
      ]
    });

    const result = parseCategorizationResponse(raw);

    assert.ok(result);
    assert.strictEqual(result!.categorizations[0].confidence, 0.5);
  });
});

describe("batchBookmarks", () => {
  it("returns a single batch when bookmarks fit within the limit", () => {
    const bookmarks: Bookmark[] = Array.from({ length: 10 }, (_, i) => ({
      id: `b-${i}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
      tags: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      source: "chromium" as const
    }));

    const batches = batchBookmarks(bookmarks, 50);
    assert.strictEqual(batches.length, 1);
    assert.strictEqual(batches[0].length, 10);
  });

  it("splits bookmarks into multiple batches", () => {
    const bookmarks: Bookmark[] = Array.from({ length: 120 }, (_, i) => ({
      id: `b-${i}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
      tags: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      source: "chromium" as const
    }));

    const batches = batchBookmarks(bookmarks, 50);
    assert.strictEqual(batches.length, 3);
    assert.strictEqual(batches[0].length, 50);
    assert.strictEqual(batches[1].length, 50);
    assert.strictEqual(batches[2].length, 20);
  });
});
