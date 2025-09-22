# Synchronization Protocol

This document tracks how Capybara keeps bookmark data aligned across browsers and how to evolve the pipeline.

## High-Level Workflow

1. `synchronizeBookmarks` is triggered by the background worker during startup or on a scheduled interval.
2. Provider modules fetch data from the underlying browser APIs. The Chromium adapter prefers the promise-based `browser.bookmarks.getTree` API but falls back to the callback-driven `chrome.bookmarks.getTree` when necessary. The Firefox adapter does the same while short-circuiting outside Firefox environments. Both providers normalize the tree through `flattenBookmarkTree`, which extracts titles, URLs, tags (including the legacy `metaInfo` tags), and creation timestamps into `Bookmark` records.
3. The domain merger removes duplicates using stable bookmark IDs, while the categorizer enriches the set with derived categories.
4. The search index is refreshed so the popup can resolve queries locally without querying browser APIs again.

## Provider Contracts

All providers must resolve to an array of `Bookmark` objects defined in [`src/domain/models/bookmark.ts`](../../packages/web-extension/src/domain/models/bookmark.ts). They should favor incremental fetching where possible but can fall back to a full tree traversal while the dataset remains small.

## Current Providers

### Chromium adapter

- Skips execution when the runtime matches Firefox (detected via the shared `isFirefoxEnvironment` utility) to prevent redundant fetches.
- Prefers `browser.bookmarks.getTree`, falling back to wrapping `chrome.bookmarks.getTree` in a promise and surfacing any `chrome.runtime.lastError` value as a thrown error.
- Returns a flattened array of bookmarks, collecting tag values from the node's `tags` property or `metaInfo` fields and coercing the `dateAdded` timestamp to an ISO string for the domain model.
- Yields an empty array when no bookmark API is available so the orchestrator can continue merging data from other providers.

### Firefox adapter

- Uses `isFirefoxEnvironment` to ensure the provider only runs when the extension is executing inside Firefox.
- Calls `browser.bookmarks.getTree` when the WebExtension promise API is present, or falls back to the Chrome callback signature in environments that polyfill Firefox APIs through `chrome`.
- Shares the same flattening logic as the Chromium adapter so downstream services receive a consistent shape regardless of origin.
- Returns an empty array if the environment lacks bookmark APIs, allowing future providers to supply data without special casing.

## Triggering Sync

- **Startup:** Register the `synchronizeBookmarks` call in the background script's lifecycle hooks.
- **Manual refresh:** Future iterations can expose a UI toggle or command that calls the same function through `chrome.runtime` messaging.
- **Scheduled updates:** Chrome alarms or `setInterval` timers can reuse the orchestrator without additional refactoring.

## Limitations and Evolution Plan

- **Environment detection:** Firefox detection currently relies on user-agent parsing. Switching to feature probes (e.g., `browser.runtime.getBrowserInfo`) will eliminate false positives from custom Chromium builds with "Firefox" in the UA string.
- **Full-tree fetches:** Both adapters call `getTree`, which can become expensive for large bookmark libraries. Introducing incremental updates via `bookmarks.onCreated`, `onChanged`, and `onRemoved` listeners will reduce work between sync cycles.
- **Error propagation:** Errors from `chrome.bookmarks.getTree` are surfaced, but the orchestrator still treats missing providers as success. Extending the orchestrator to collect provider-level errors and expose them through telemetry or stored diagnostics will improve debuggability.
- **Provider coverage:** Only Chromium and Firefox APIs are implemented today. Future iterations should add adapters for Safari (via the forthcoming WebExtensions bridge) and mobile browsers, all conforming to the shared `Bookmark[]` contract.
- **State caching:** Providers return fresh data every time. Persisting the last successful payload (or hashes of bookmark trees) in extension storage will enable change detection and offline resilience without re-downloading entire trees.
