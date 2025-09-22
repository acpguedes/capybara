import type { Bookmark } from "../../domain/models/bookmark";

export type BookmarkProviderAvailability = "success" | "unavailable";

export interface BookmarkProviderResult {
  bookmarks: Bookmark[];
  availability: BookmarkProviderAvailability;
}
