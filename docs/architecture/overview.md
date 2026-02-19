# Architecture Overview

Capybara is delivered as a cross-browser extension. The codebase is organized around the background worker that synchronizes bookmarks, a set of domain services that model and enrich the data, and lightweight React-driven UI surfaces that surface the results.

## Component Map

| Layer | Responsibility | Representative Modules |
| --- | --- | --- |
| Background worker | Coordinates multi-browser synchronization and prepares data for the UI. | [`src/background/index.ts`](../../packages/web-extension/src/background/index.ts), bookmark providers under [`src/background/bookmark-sync`](../../packages/web-extension/src/background/bookmark-sync/).
| Domain services | Normalize, merge, categorize, and index bookmark data. | [`mergeBookmarks`](../../packages/web-extension/src/domain/services/merger.ts), [`categorizeBookmarks`](../../packages/web-extension/src/domain/services/categorizer.ts), [`categorizeBookmarksWithLLM`](../../packages/web-extension/src/domain/services/llm-categorizer.ts), [`searchBookmarks`](../../packages/web-extension/src/domain/services/search.ts).
| LLM providers | Multi-provider abstraction for AI-powered categorization. | [`provider-factory`](../../packages/web-extension/src/domain/services/llm-providers/provider-factory.ts), individual providers for OpenAI, Anthropic, Gemini, and Ollama.
| User interface | Presents indexed bookmarks and configuration options. | Popup [`App`](../../packages/web-extension/src/popup/App.tsx), options [`Settings`](../../packages/web-extension/src/options/settings.tsx).

## Data Flow

1. The background worker invokes `synchronizeBookmarks`, which concurrently fetches bookmark trees from Chromium- and Firefox-compatible APIs. The providers are intentionally stubbed so platform-specific implementations can be added without disturbing the orchestration pipeline.
2. Retrieved bookmarks are merged to remove duplicates while preserving browser-specific entries.
3. The categorizer annotates each bookmark with a derived category, defaulting to semantic tags when supplied or extracting a hostname-based fallback. When LLM categorization is enabled, bookmarks are sent in batches to the configured provider for semantic categorization; the heuristic categorizer serves as the automatic fallback.
4. The search service indexes the enriched set in-memory so the popup UI can execute fast, zero-dependency lookups.

The pipeline supports both synchronous heuristic categorization and asynchronous LLM-based enrichment. See the [LLM Configuration Guide](../configuration/llm-setup.md) for setup instructions.

## Extensibility Notes

- New providers (for Safari or mobile browsers) should conform to the `Bookmark[]` contract defined in `src/domain/models/bookmark.ts`.
- Additional enrichment steps, such as popularity scoring or content previews, can be added as new domain services that decorate the array before it reaches the search index.
- UI surfaces can subscribe to richer data structures by reusing the search service or by introducing selector utilities in the domain layer.
