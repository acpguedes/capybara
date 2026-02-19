import type { Bookmark } from "../models/bookmark";
import type { CategorizedBookmark } from "../models/categorized-bookmark";
import type { LLMConfiguration } from "../models/llm-configuration";
import { ensureHostPermission, getHostPermissionInfo } from "../../shared/extension-permissions";
import { categorizeBookmarks } from "./categorizer";
import { loadLLMConfiguration } from "./llm-settings";
import { createLLMProvider } from "./llm-providers/provider-factory";
import {
  buildCategorizationPrompt,
  parseCategorizationResponse,
  batchBookmarks
} from "./llm-prompt";
import { loadCategories, addNewCategories } from "./category-store";

async function categorizeBatchWithLLM(
  bookmarks: Bookmark[],
  configuration: LLMConfiguration
): Promise<Map<string, string>> {
  const provider = createLLMProvider(configuration);
  const existingCategories = await loadCategories();

  const { systemPrompt, userMessage } = buildCategorizationPrompt(
    bookmarks,
    existingCategories
  );

  const response = await provider.complete({
    systemPrompt,
    userMessage,
    temperature: 0.3,
    maxTokens: 4096
  });

  const parsed = parseCategorizationResponse(response.content);
  if (!parsed) {
    throw new Error("LLM response could not be parsed as categorization data");
  }

  if (parsed.newCategories.length > 0) {
    await addNewCategories(parsed.newCategories);
  }

  const categoryMap = new Map<string, string>();
  for (const item of parsed.categorizations) {
    if (item.category.trim().length > 0) {
      categoryMap.set(item.id, item.category);
    }
  }

  return categoryMap;
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
    const hasCredentials = configuration.provider === "ollama" ||
      configuration.apiKey.trim().length > 0;

    if (!configuration.enabled || endpoint.length === 0 || !hasCredentials) {
      return fallbackCategorized;
    }

    const endpointInfo = getHostPermissionInfo(endpoint);
    if (!endpointInfo) {
      return fallbackCategorized;
    }

    const hasPermission = await ensureHostPermission(endpointInfo.pattern);
    if (!hasPermission) {
      throw new Error(`Missing host permission for ${endpointInfo.origin}`);
    }

    const batches = batchBookmarks(bookmarks);
    const allCategoryMappings = new Map<string, string>();

    for (const batch of batches) {
      const batchMappings = await categorizeBatchWithLLM(batch, configuration);
      for (const [id, category] of batchMappings) {
        allCategoryMappings.set(id, category);
      }
    }

    return fallbackCategorized.map((bookmark) => {
      const llmCategory = allCategoryMappings.get(bookmark.id);
      if (!llmCategory || llmCategory.trim().length === 0) {
        return bookmark;
      }

      return { ...bookmark, category: llmCategory };
    });
  } catch (error) {
    console.warn("Falling back to heuristic categorizer due to LLM error", error);
    return fallbackCategorized;
  }
}
