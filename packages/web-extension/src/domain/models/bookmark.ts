export type BookmarkSource = "chromium" | "firefox";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
  source: BookmarkSource;
}
