import type { Bookmark } from "./bookmark";

export interface CategorizedBookmark extends Bookmark {
  category: string;
}
