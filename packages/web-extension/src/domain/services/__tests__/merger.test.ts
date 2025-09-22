import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Bookmark } from "../../models/bookmark";
import { mergeBookmarks } from "../merger";

describe("mergeBookmarks", () => {
  it("collapses bookmarks with identical normalized URLs across providers", () => {
    const chromium: Bookmark[] = [
      {
        id: "chromium-shared",
        title: "Chromium Shared",
        url: "https://example.test/shared",
        tags: ["shared"],
        createdAt: "2024-01-01T00:00:00.000Z",
        source: "chromium"
      },
      {
        id: "chromium-unique",
        title: "Chromium Unique",
        url: "https://chromium.test/only",
        tags: ["chromium"],
        createdAt: "2024-01-02T00:00:00.000Z",
        source: "chromium"
      }
    ];

    const firefox: Bookmark[] = [
      {
        id: "firefox-shared",
        title: "Firefox Shared",
        url: "HTTPS://EXAMPLE.test/shared",
        tags: ["shared"],
        createdAt: "2024-01-03T00:00:00.000Z",
        source: "firefox"
      },
      {
        id: "firefox-unique",
        title: "Firefox Unique",
        url: "https://firefox.test/only",
        tags: ["firefox"],
        createdAt: "2024-01-04T00:00:00.000Z",
        source: "firefox"
      }
    ];

    const merged = mergeBookmarks(chromium, firefox);

    assert.deepStrictEqual(merged, [
      chromium[0],
      chromium[1],
      firefox[1]
    ]);
  });
});
