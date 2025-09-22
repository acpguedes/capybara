import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BookmarkTreeNode, flattenBookmarkTree } from "../bookmark-tree";

describe("flattenBookmarkTree", () => {
  it("flattens Chromium bookmark tree payloads", () => {
    const firstTimestamp = 1716230400000;
    const secondTimestamp = 1716316800000;

    const chromiumTree: BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bookmarks bar",
            children: [
              {
                id: "10",
                title: "Example Domain",
                url: "https://example.com",
                dateAdded: firstTimestamp
              }
            ]
          },
          {
            id: "2",
            title: "Other bookmarks",
            children: [
              {
                id: "20",
                title: "MDN Web Docs",
                url: "https://developer.mozilla.org",
                dateAdded: secondTimestamp
              }
            ]
          }
        ]
      }
    ];

    const bookmarks = flattenBookmarkTree(chromiumTree, "chromium");

    assert.deepStrictEqual(bookmarks, [
      {
        id: "10",
        title: "Example Domain",
        url: "https://example.com",
        tags: [],
        createdAt: new Date(firstTimestamp).toISOString(),
        source: "chromium"
      },
      {
        id: "20",
        title: "MDN Web Docs",
        url: "https://developer.mozilla.org",
        tags: [],
        createdAt: new Date(secondTimestamp).toISOString(),
        source: "chromium"
      }
    ]);
  });

  it("normalizes Firefox bookmark tree payloads", () => {
    const firstTimestamp = 1716403200000;
    const secondTimestamp = 1716489600000;

    const firefoxTree: BookmarkTreeNode[] = [
      {
        id: "root________",
        title: "",
        type: "folder",
        children: [
          {
            id: "toolbar_____",
            title: "Bookmarks Toolbar",
            type: "folder",
            children: [
              {
                id: "ff-1",
                title: "MDN Web Docs",
                url: "https://developer.mozilla.org",
                type: "bookmark",
                dateAdded: firstTimestamp,
                tags: "reference,  web ",
                metaInfo: { tags: "reference" }
              }
            ]
          },
          {
            id: "menu________",
            title: "Bookmarks Menu",
            type: "folder",
            children: [
              {
                id: "ff-2",
                title: "Example Domain",
                url: "https://example.com",
                type: "bookmark",
                dateAdded: secondTimestamp,
                tags: " ",
                metaInfo: { tag: "general, samples" }
              }
            ]
          }
        ]
      }
    ];

    const bookmarks = flattenBookmarkTree(firefoxTree, "firefox");

    assert.deepStrictEqual(bookmarks, [
      {
        id: "ff-1",
        title: "MDN Web Docs",
        url: "https://developer.mozilla.org",
        tags: ["reference", "web"],
        createdAt: new Date(firstTimestamp).toISOString(),
        source: "firefox"
      },
      {
        id: "ff-2",
        title: "Example Domain",
        url: "https://example.com",
        tags: ["general", "samples"],
        createdAt: new Date(secondTimestamp).toISOString(),
        source: "firefox"
      }
    ]);
  });
});
