import { CATEGORIES_STORAGE_KEY, type Category } from "../models/category";
import { getItem, setItem } from "./extension-storage";
import type { NewCategory } from "./llm-prompt";

function normalizeCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (item): item is Category =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as Category).name === "string" &&
      (item as Category).name.trim().length > 0
  );
}

export async function loadCategories(): Promise<Category[]> {
  const stored = await getItem(CATEGORIES_STORAGE_KEY);
  return normalizeCategories(stored);
}

export async function saveCategories(categories: Category[]): Promise<void> {
  await setItem(CATEGORIES_STORAGE_KEY, categories);
}

export async function addNewCategories(newCategories: NewCategory[]): Promise<Category[]> {
  const existing = await loadCategories();
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const now = new Date().toISOString();

  const additions: Category[] = newCategories
    .filter((c) => !existingNames.has(c.name.toLowerCase()))
    .map((c) => ({
      name: c.name,
      description: c.description,
      source: "llm" as const,
      createdAt: now
    }));

  if (additions.length === 0) {
    return existing;
  }

  const updated = [...existing, ...additions];
  await saveCategories(updated);
  return updated;
}
