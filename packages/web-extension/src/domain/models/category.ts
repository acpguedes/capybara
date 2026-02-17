export interface Category {
  name: string;
  description: string;
  source: "llm" | "user" | "heuristic";
  createdAt: string;
}

export const CATEGORIES_STORAGE_KEY = "bookmarkCategories";
