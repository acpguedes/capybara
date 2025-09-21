import type { Bookmark } from "../models/bookmark";
import type { CategorizedBookmark } from "../models/categorized-bookmark";
import type { LLMConfiguration } from "../models/llm-configuration";
import { categorizeBookmarks } from "./categorizer";
import { loadLLMConfiguration } from "./llm-settings";

interface LLMRequestPayload {
  bookmarks: Array<Pick<Bookmark, "id" | "title" | "url" | "tags">>;
  model?: string;
}

interface LLMResponsePayload {
  categories: Array<{ id: string; category: string }>;
}

function buildHeaders(configuration: LLMConfiguration): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  const apiKey = configuration.apiKey.trim();
  if (apiKey.length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function parseResponse(payload: unknown): LLMResponsePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as Partial<LLMResponsePayload>;
  if (!Array.isArray(value.categories)) {
    return null;
  }

  const categories = value.categories.filter((item): item is { id: string; category: string } => {
    return Boolean(item) && typeof item.id === "string" && typeof item.category === "string";
  });

  if (categories.length === 0) {
    return null;
  }

  return { categories };
}

export async function categorizeBookmarksWithLLM(
  bookmarks: Bookmark[]
): Promise<CategorizedBookmark[]> {
  if (bookmarks.length === 0) {
    return [];
  }

  const fallbackCategorized = categorizeBookmarks(bookmarks);

  try {
    const configuration = await loadLLMConfiguration();
    if (!configuration) {
      return fallbackCategorized;
    }

    const endpoint = configuration.endpoint.trim();
    const apiKey = configuration.apiKey.trim();

    if (!configuration.enabled || endpoint.length === 0 || apiKey.length === 0) {
      return fallbackCategorized;
    }

    const payload: LLMRequestPayload = {
      bookmarks: bookmarks.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        tags: bookmark.tags
      }))
    };

    if (configuration.model && configuration.model.trim().length > 0) {
      payload.model = configuration.model.trim();
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(configuration),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const parsed = parseResponse(await response.json());
    if (!parsed) {
      throw new Error("LLM response payload was malformed");
    }

    const categoryById = new Map(parsed.categories.map((item) => [item.id, item.category]));

    return fallbackCategorized.map((bookmark) => {
      const category = categoryById.get(bookmark.id);
      if (!category || category.trim().length === 0) {
        return bookmark;
      }

      return { ...bookmark, category };
    });
  } catch (error) {
    console.warn("Falling back to heuristic categorizer due to LLM error", error);
    return fallbackCategorized;
  }
}
