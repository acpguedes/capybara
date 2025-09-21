# Synchronization Protocol

This document tracks how Capybara keeps bookmark data aligned across browsers and how to evolve the pipeline.

## High-Level Workflow

1. `synchronizeBookmarks` is triggered by the background worker during startup or on a scheduled interval.
2. Provider modules fetch data from the underlying browser APIs. The Chromium and Firefox providers currently return empty arrays as placeholders; implementation teams should replace the stubs with concrete API calls.
3. The domain merger removes duplicates using stable bookmark IDs, while the categorizer enriches the set with derived categories.
4. The search index is refreshed so the popup can resolve queries locally without querying browser APIs again.

## Provider Contracts

All providers must resolve to an array of `Bookmark` objects defined in [`src/domain/models/bookmark.ts`](../../packages/web-extension/src/domain/models/bookmark.ts). They should favor incremental fetching where possible but can fall back to a full tree traversal while the dataset remains small.

## Triggering Sync

- **Startup:** Register the `synchronizeBookmarks` call in the background script's lifecycle hooks.
- **Manual refresh:** Future iterations can expose a UI toggle or command that calls the same function through `chrome.runtime` messaging.
- **Scheduled updates:** Chrome alarms or `setInterval` timers can reuse the orchestrator without additional refactoring.

## Error Handling Roadmap

The current implementation fails silently because the providers return resolved promises. When API calls are introduced:

- Wrap provider calls in try/catch blocks at the provider level and surface structured errors.
- Extend the orchestrator to log failures and keep the prior index alive to avoid empty UI states.
- Consider storing the last successful payload in browser storage for resilience.
