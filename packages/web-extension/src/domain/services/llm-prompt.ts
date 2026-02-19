import type { Bookmark } from "../models/bookmark";
import type { Category } from "../models/category";

const SYSTEM_PROMPT = `You are a bookmark categorization expert. Your task is to analyze web bookmarks and assign each one to the most appropriate category.

RULES:
1. Each bookmark MUST be assigned exactly ONE category.
2. Category names should be concise: 1-3 words, Title Case (e.g., "Machine Learning", "Web Development", "Personal Finance").
3. PREFER existing categories when they fit. Only create a new category when no existing one reasonably applies.
4. Categories should be SEMANTIC and topic-based, NOT domain-based. Use "Machine Learning" instead of "arxiv.org", "News" instead of "bbc.com".
5. Be consistent: similar bookmarks should get the same category.
6. Consider the title, URL path, and any existing tags to determine the best category.
7. When tags exist, use them as strong hints but not absolute rules — a tag of "js" on a TypeScript article should still map to "Web Development" or "Programming", not a literal "js" category.

You MUST respond with valid JSON in this exact format:
{
  "categorizations": [
    { "id": "<bookmark_id>", "category": "<Category Name>", "confidence": <0.0-1.0> }
  ],
  "newCategories": [
    { "name": "<Category Name>", "description": "<Brief description of what this category covers>" }
  ]
}

IMPORTANT:
- "categorizations" MUST include an entry for every bookmark provided.
- "newCategories" should ONLY list categories that are NOT in the existing categories list.
- "confidence" is a float between 0.0 and 1.0 indicating how confident you are in the categorization.
- Do NOT wrap JSON in markdown code blocks. Return raw JSON only.`;

export interface CategorizationResult {
  id: string;
  category: string;
  confidence: number;
}

export interface NewCategory {
  name: string;
  description: string;
}

export interface CategorizationResponse {
  categorizations: CategorizationResult[];
  newCategories: NewCategory[];
}

function formatBookmarkForPrompt(bookmark: Bookmark): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url
  };

  if (bookmark.tags.length > 0) {
    entry.tags = bookmark.tags;
  }

  return entry;
}

export function buildCategorizationPrompt(
  bookmarks: Bookmark[],
  existingCategories: Category[]
): { systemPrompt: string; userMessage: string } {
  const categoryNames = existingCategories.map((c) => c.name);

  const categoriesSection = categoryNames.length > 0
    ? `\n\nEXISTING CATEGORIES (prefer these when applicable):\n${categoryNames.map((name) => `- ${name}`).join("\n")}`
    : "\n\nNo existing categories yet. Create appropriate categories as needed.";

  const bookmarkEntries = bookmarks.map(formatBookmarkForPrompt);

  const userMessage = `${categoriesSection}

BOOKMARKS TO CATEGORIZE (${bookmarks.length} total):
${JSON.stringify(bookmarkEntries, null, 2)}`;

  return { systemPrompt: SYSTEM_PROMPT, userMessage };
}

export function parseCategorizationResponse(raw: string): CategorizationResponse | null {
  try {
    // Strip markdown code blocks if the LLM wraps the response
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleaned) as Partial<CategorizationResponse>;

    if (!Array.isArray(parsed.categorizations)) {
      return null;
    }

    const categorizations = parsed.categorizations.filter(
      (item): item is CategorizationResult =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.category === "string" &&
        item.category.trim().length > 0
    ).map((item) => ({
      ...item,
      confidence: typeof item.confidence === "number" ? item.confidence : 0.5
    }));

    if (categorizations.length === 0) {
      return null;
    }

    const newCategories = Array.isArray(parsed.newCategories)
      ? parsed.newCategories.filter(
          (item): item is NewCategory =>
            Boolean(item) &&
            typeof item.name === "string" &&
            item.name.trim().length > 0 &&
            typeof item.description === "string"
        )
      : [];

    return { categorizations, newCategories };
  } catch {
    return null;
  }
}

/**
 * Split bookmarks into batches for processing.
 * LLMs have context limits, so we process in groups.
 */
export function batchBookmarks(bookmarks: Bookmark[], batchSize: number = 50): Bookmark[][] {
  const batches: Bookmark[][] = [];
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }
  return batches;
}
