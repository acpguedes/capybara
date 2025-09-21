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

The options surface (`Settings` component) currently exposes a single "Enable automatic synchronization" toggle using React state. While the value is not persisted yet, it demonstrates the layout for future preference screens.

Enhancements to consider:

- Persist settings to `chrome.storage.sync` so changes roam with the user.
- Add per-browser include/exclude lists that map to provider configuration.
- Provide manual refresh and diagnostics actions for support scenarios.
