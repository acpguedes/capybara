import { Bookmark, BookmarkSource } from "../../domain/models/bookmark";

export interface BookmarkTreeNode {
  id: string;
  title?: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkTreeNode[];
  tags?: string | string[];
  metaInfo?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export function flattenBookmarkTree(
  tree: BookmarkTreeNode[],
  source: BookmarkSource
): Bookmark[] {
  const bookmarks: Bookmark[] = [];

  const visit = (node: BookmarkTreeNode): void => {
    if (typeof node.url === "string") {
      bookmarks.push({
        id: node.id,
        title: node.title ?? "",
        url: node.url,
        tags: collectTags(node),
        createdAt: toIsoDate(node.dateAdded),
        source
      });
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };

  for (const node of tree) {
    visit(node);
  }

  return bookmarks;
}

function collectTags(node: BookmarkTreeNode): string[] {
  const tags: string[] = [];

  const append = (value?: string | string[]): void => {
    if (!value) {
      return;
    }

    const values = Array.isArray(value) ? value : value.split(",");

    for (const entry of values) {
      const trimmed = entry.trim();
      if (trimmed.length === 0 || tags.includes(trimmed)) {
        continue;
      }

      tags.push(trimmed);
    }
  };

  append(node.tags);

  if (node.metaInfo) {
    append(node.metaInfo.tags);
    append(node.metaInfo.tag);
  }

  return tags;
}

function toIsoDate(dateAdded?: number): string {
  const timestamp = typeof dateAdded === "number" ? dateAdded : 0;
  return new Date(timestamp).toISOString();
}
