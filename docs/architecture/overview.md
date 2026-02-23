# Architecture Overview

Capybara is a cross-browser extension that evolves from bookmark management into personal knowledge management. The architecture is organized around a **data enrichment pipeline**: a background worker acquires bookmarks, domain services normalize, enrich, and connect the data, and lightweight React UIs surface the results.

## System Design

```
                    +-----------------+
                    |  Browser APIs   |
                    |  (Chromium/FF)  |
                    +-------+---------+
                            |
                    +-------v---------+
                    |   Fetch Layer   |
                    |   (Providers)   |
                    +-------+---------+
                            |
                    +-------v---------+
                    |  Merge Service  |
                    |  (Deduplicate)  |
                    +-------+---------+
                            |
               +------------+------------+
               |                         |
       +-------v---------+     +--------v--------+
       |   Categorizer   |     |  LLM Enrichment |
       |   (Heuristic)   |     |   (Optional)    |
       +-------+---------+     +--------+--------+
               |                         |
               +------------+------------+
                            |
               +------------+------------+
               |                         |
       +-------v---------+     +--------v--------+
       |    Relation      |     |  Usage Tracker  |
       |    Discovery     |     |  (Access Stats) |
       +-------+---------+     +--------+--------+
               |                         |
               +------------+------------+
                            |
                    +-------v---------+
                    |  Search Index   |
                    |  (Relevance)    |
                    +-------+---------+
                            |
               +------------+------------+
               |                         |
       +-------v---------+     +--------v--------+
       |     Popup UI     |     |   Options UI   |
       |  (Quick Search)  |     | (Configuration) |
       +-----------------+     +-----------------+
```

## Component Map

| Layer | Responsibility | Key Modules |
| --- | --- | --- |
| **Background worker** | Coordinates multi-browser synchronization, schedules periodic updates, bootstraps the data pipeline | [`src/background/index.ts`](../../packages/web-extension/src/background/index.ts), providers under [`src/background/bookmark-sync/`](../../packages/web-extension/src/background/bookmark-sync/) |
| **Domain models** | TypeScript interfaces defining the knowledge domain: bookmarks, categories, relationships, usage events | [`src/domain/models/`](../../packages/web-extension/src/domain/models/) |
| **Merge service** | Normalizes URLs and deduplicates bookmarks across browser sources | [`merger.ts`](../../packages/web-extension/src/domain/services/merger.ts) |
| **Categorization** | Assigns categories via heuristics (tags, hostnames) or optional LLM enrichment | [`categorizer.ts`](../../packages/web-extension/src/domain/services/categorizer.ts), [`llm-categorizer.ts`](../../packages/web-extension/src/domain/services/llm-categorizer.ts) |
| **Relation discovery** | Builds a lightweight knowledge graph by identifying connections between bookmarks (same domain, same category) | [`relation-discovery.ts`](../../packages/web-extension/src/domain/services/relation-discovery.ts) |
| **Usage tracking** | Records bookmark access events and computes usage statistics for intelligent recall | [`usage-tracker.ts`](../../packages/web-extension/src/domain/services/usage-tracker.ts) |
| **Search index** | In-memory index with substring matching and relevance scoring for sub-100ms queries | [`search.ts`](../../packages/web-extension/src/domain/services/search.ts) |
| **LLM providers** | Multi-provider abstraction for AI-powered categorization (OpenAI, Anthropic, Gemini, Ollama, custom) | [`llm-providers/`](../../packages/web-extension/src/domain/services/llm-providers/) |
| **Storage** | Cross-browser storage abstraction with optional AES-GCM encryption | [`extension-storage.ts`](../../packages/web-extension/src/domain/services/extension-storage.ts), [`bookmark-snapshot-crypto.ts`](../../packages/web-extension/src/domain/services/bookmark-snapshot-crypto.ts) |
| **User interface** | React-driven popup for quick search and options page for configuration | [`popup/App.tsx`](../../packages/web-extension/src/popup/App.tsx), [`options/settings.tsx`](../../packages/web-extension/src/options/settings.tsx) |

## Data Flow

### Core Pipeline

1. **Fetch:** The background worker invokes `synchronizeBookmarks`, which concurrently fetches bookmark trees from Chromium- and Firefox-compatible APIs. Providers are abstracted so new browsers can be added without disturbing the pipeline.

2. **Merge:** Retrieved bookmarks are deduplicated by normalized URL while preserving browser-specific metadata. Existing bookmarks from unavailable providers are retained for resilience.

3. **Categorize:** The heuristic categorizer annotates each bookmark with a derived category from tags or hostname. When LLM categorization is enabled, bookmarks are sent in batches for semantic enrichment with automatic fallback to heuristics.

4. **Relate:** The relation discovery service identifies connections between bookmarks by analyzing shared domains and categories, building a lightweight knowledge graph with weighted edges.

5. **Track:** The usage tracker records access events (clicks, search hits, previews) and computes statistics that inform relevance scoring and intelligent recall.

6. **Index:** The search index stores enriched bookmarks in memory, supporting both simple substring queries and relevance-scored results.

7. **Render:** The popup UI surfaces indexed bookmarks with instant search. The options page provides configuration for sync, LLM enrichment, and system status.

### Knowledge Graph

Bookmark relationships form a lightweight knowledge graph:

```
[Bookmark A] --same-domain--> [Bookmark B]
     |                              |
     +--same-category---> [Bookmark C]
```

Relationships are discovered automatically by the relation discovery service. Each relationship has:
- A **type** (same-domain, same-category, similar-content, user-linked, co-visited)
- A **strength** (0.0 to 1.0) indicating how strong the connection is

This graph enables features like "related bookmarks" and informs future semantic search capabilities.

## Domain Models

| Model | Purpose | File |
|-------|---------|------|
| `Bookmark` | Core bookmark with title, URL, tags, source | [`bookmark.ts`](../../packages/web-extension/src/domain/models/bookmark.ts) |
| `CategorizedBookmark` | Bookmark with assigned category | [`categorized-bookmark.ts`](../../packages/web-extension/src/domain/models/categorized-bookmark.ts) |
| `Category` | Category metadata with source tracking | [`category.ts`](../../packages/web-extension/src/domain/models/category.ts) |
| `BookmarkRelation` | Knowledge graph edge between bookmarks | [`bookmark-relation.ts`](../../packages/web-extension/src/domain/models/bookmark-relation.ts) |
| `UsageEvent` / `BookmarkUsageStats` | Access tracking for intelligent recall | [`usage-event.ts`](../../packages/web-extension/src/domain/models/usage-event.ts) |
| `BookmarkSnapshot` | Serializable snapshot with encryption support | [`bookmark-snapshot.ts`](../../packages/web-extension/src/domain/models/bookmark-snapshot.ts) |
| `SyncSettings` | Multi-device sync configuration | [`sync-settings.ts`](../../packages/web-extension/src/domain/models/sync-settings.ts) |
| `LLMConfiguration` | AI provider settings | [`llm-configuration.ts`](../../packages/web-extension/src/domain/models/llm-configuration.ts) |

## Extensibility Notes

- **New browser providers** (Safari, mobile) should conform to the `Bookmark[]` contract defined in `bookmark.ts` and return a `BookmarkProviderResult`.
- **New enrichment steps** (content previews, link health checks) can be added as domain services that decorate the bookmark array before it reaches the search index.
- **New relation types** can be added to `RelationType` and discovered in `relation-discovery.ts`.
- **New LLM providers** implement the `LLMProvider` interface and register in `provider-factory.ts`.
- **UI surfaces** can subscribe to richer data structures by using the scored search API or by querying the relation graph for contextual recommendations.

## Design Principles

- **Dependency injection:** Services expose `set*Dependencies()` functions to swap implementations for testing. No external mocking library needed.
- **Graceful degradation:** Missing providers, failed LLM calls, and storage errors are caught and handled without crashing the pipeline.
- **Privacy by default:** No network access unless the user explicitly enables LLM or sync features. All data stored locally.
- **Progressive enhancement:** Each pipeline stage enriches data additively. The system works with just the merge step; each subsequent step adds value.
