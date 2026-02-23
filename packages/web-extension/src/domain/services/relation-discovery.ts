import type { CategorizedBookmark } from "../models/categorized-bookmark";
import type { BookmarkRelation, RelationType } from "../models/bookmark-relation";
import { BOOKMARK_RELATIONS_STORAGE_KEY } from "../models/bookmark-relation";
import { getItem, setItem } from "./extension-storage";

function generateRelationId(
  sourceId: string,
  targetId: string,
  relationType: RelationType
): string {
  return `${relationType}::${sourceId}::${targetId}`;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    return "";
  }
}

function discoverSameDomainRelations(
  bookmarks: CategorizedBookmark[]
): BookmarkRelation[] {
  const relations: BookmarkRelation[] = [];
  const domainGroups = new Map<string, CategorizedBookmark[]>();

  for (const bookmark of bookmarks) {
    const domain = extractDomain(bookmark.url);
    if (!domain) continue;

    const group = domainGroups.get(domain) ?? [];
    group.push(bookmark);
    domainGroups.set(domain, group);
  }

  const now = new Date().toISOString();

  for (const group of domainGroups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        relations.push({
          id: generateRelationId(group[i].id, group[j].id, "same-domain"),
          sourceBookmarkId: group[i].id,
          targetBookmarkId: group[j].id,
          relationType: "same-domain",
          strength: 0.6,
          createdAt: now
        });
      }
    }
  }

  return relations;
}

function discoverSameCategoryRelations(
  bookmarks: CategorizedBookmark[]
): BookmarkRelation[] {
  const relations: BookmarkRelation[] = [];
  const categoryGroups = new Map<string, CategorizedBookmark[]>();

  for (const bookmark of bookmarks) {
    if (bookmark.category === "uncategorized") continue;

    const group = categoryGroups.get(bookmark.category) ?? [];
    group.push(bookmark);
    categoryGroups.set(bookmark.category, group);
  }

  const now = new Date().toISOString();

  for (const group of categoryGroups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const sameDomain =
          extractDomain(group[i].url) === extractDomain(group[j].url);

        relations.push({
          id: generateRelationId(
            group[i].id,
            group[j].id,
            "same-category"
          ),
          sourceBookmarkId: group[i].id,
          targetBookmarkId: group[j].id,
          relationType: "same-category",
          strength: sameDomain ? 0.9 : 0.5,
          createdAt: now
        });
      }
    }
  }

  return relations;
}

export function discoverRelations(
  bookmarks: CategorizedBookmark[]
): BookmarkRelation[] {
  const domainRelations = discoverSameDomainRelations(bookmarks);
  const categoryRelations = discoverSameCategoryRelations(bookmarks);

  const seen = new Set<string>();
  const combined: BookmarkRelation[] = [];

  for (const relation of [...domainRelations, ...categoryRelations]) {
    const pairKey = `${relation.sourceBookmarkId}::${relation.targetBookmarkId}`;
    if (seen.has(pairKey)) {
      const existing = combined.find(
        (r) =>
          r.sourceBookmarkId === relation.sourceBookmarkId &&
          r.targetBookmarkId === relation.targetBookmarkId
      );
      if (existing && relation.strength > existing.strength) {
        existing.strength = relation.strength;
        existing.relationType = relation.relationType;
      }
      continue;
    }

    seen.add(pairKey);
    combined.push(relation);
  }

  return combined;
}

export async function loadRelations(): Promise<BookmarkRelation[]> {
  const stored = await getItem(BOOKMARK_RELATIONS_STORAGE_KEY);
  if (!stored) return [];
  return stored;
}

export async function saveRelations(
  relations: BookmarkRelation[]
): Promise<void> {
  await setItem(BOOKMARK_RELATIONS_STORAGE_KEY, relations);
}
