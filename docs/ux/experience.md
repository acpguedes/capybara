# UX Reference

The Capybara extension intentionally keeps the interface minimal to emphasize fast retrieval over heavy bookmark management.

## Popup Experience

The popup entry point is [`App.tsx`](../../packages/web-extension/src/popup/App.tsx). It renders:

- A product-branded header and search input bound to React state.
- A bookmark list populated by the in-memory search index.
- External links that open in a new browser tab using the `target="_blank"` pattern.

Design goals:

- Maintain sub-100ms query responses by keeping results in memory.
- Support keyboard users with the browser's native focus ring; future updates can add accelerators.
- Surface categories inline for quick scanning.

## Options Page

The options surface (`Settings` component) exposes synchronization preferences backed by extension storage. `loadSyncSettings` seeds the toggle state from persisted values, and `saveSyncSettings` writes updates to the browser's local storage area so changes survive popup reloads. With the manifest now wiring `options_ui` to the built page, users can open the settings screen directly from the extension's action menu or details panel.

Enhancements to consider:

- Promote settings to `chrome.storage.sync` so preferences roam across devices once the experience stabilizes.
- Add per-browser include/exclude lists that map to provider configuration.
- Provide manual refresh and diagnostics actions for support scenarios.
