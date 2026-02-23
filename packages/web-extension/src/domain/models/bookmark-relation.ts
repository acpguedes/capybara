export type RelationType =
  | "same-domain"
  | "same-category"
  | "similar-content"
  | "user-linked"
  | "co-visited";

export interface BookmarkRelation {
  id: string;
  sourceBookmarkId: string;
  targetBookmarkId: string;
  relationType: RelationType;
  strength: number;
  createdAt: string;
}

export const BOOKMARK_RELATIONS_STORAGE_KEY = "bookmarkRelations";
