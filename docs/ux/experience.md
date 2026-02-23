# UX Reference

Capybara's interface follows the principle of **calm technology**: minimal, fast, and helpful without being intrusive. The extension should feel invisible when you don't need it and immediately useful when you do.

## Design Philosophy

### Knowledge-First Experience

Capybara is not a traditional bookmark manager. The UX is designed around **knowledge retrieval and discovery**, not file management:

- **Search first, browse second:** The popup opens with focus on the search input. Finding is faster than browsing.
- **Smart results:** Search results are ranked by relevance, not just filtered by substring match.
- **Contextual connections:** Related bookmarks and categories surface nearby knowledge automatically.
- **Usage-informed recall:** Frequently and recently accessed bookmarks get priority in results.

### Progressive Disclosure

- **Zero configuration start:** The extension works immediately after installation. No setup required.
- **Advanced features on demand:** LLM categorization, encrypted sync, and knowledge graph features are opt-in.
- **Simple controls, deep capabilities:** The popup is a simple search box. The options page reveals the full system.

## Popup Experience

The popup entry point is [`App.tsx`](../../packages/web-extension/src/popup/App.tsx). It renders:

- A product-branded header with the Capybara mascot and search input bound to React state.
- A bookmark list populated by the in-memory search index with relevance scoring.
- External links that open in a new browser tab using the `target="_blank"` pattern.

### Search Behavior

- **Empty query:** Shows all bookmarks, prioritizing recently accessed and frequently used items.
- **Active query:** Filters and ranks results by relevance score across title, URL, category, and tags.
- **Relevance factors:**
  - Exact title match: highest priority
  - Title prefix match: high priority
  - Title substring match: medium priority
  - Tag exact match: high priority
  - Category match: medium priority
  - URL match: supplementary signal
  - Multi-word queries: scored by proportion of matched words

### Design Goals

- Maintain sub-100ms query responses by keeping results in memory.
- Support keyboard users with the browser's native focus ring.
- Surface categories and relationship context inline for quick scanning.
- Show bookmark usage indicators (recently accessed, frequently used) when relevant.

## Options Page

The options surface (`Settings` component) exposes synchronization preferences, LLM configuration, and system status. It is organized in tabs:

### Quick Start Tab
A guided walkthrough for new users covering installation verification, database status, and LLM setup.

### LLM Configuration Tab
Provider selection grid, API key management, model configuration, and permission handling. Validates settings before saving and displays clear status messages.

### Synchronization Tab
Enable/disable multi-device sync with optional passphrase for encryption key derivation.

### About Tab
Privacy statement, architecture overview, and links to documentation.

## Knowledge Management Patterns

These UX patterns support the knowledge management vision:

### Intelligent Recall
- **Recently accessed:** Surface bookmarks the user interacted with recently.
- **Frequently accessed:** Highlight bookmarks with high usage counts.
- **Never accessed:** Identify bookmarks saved but never revisited (potential cleanup candidates).

### Knowledge Discovery
- **Related bookmarks:** When viewing a bookmark, show others from the same domain or category.
- **Category clusters:** Group bookmarks by category with count indicators.
- **Knowledge gaps:** Identify categories with few entries that might benefit from more research.

### Organization Assistance
- **Auto-categorization feedback:** When LLM assigns a category, show it clearly so users can verify.
- **Category evolution:** Track how categories grow and change over time.
- **Duplicate detection:** Flag bookmarks that point to very similar content across different URLs.

## Interaction Patterns

### Bookmark Click
1. User clicks a bookmark link in the popup.
2. System records a `click` usage event for the bookmark.
3. Link opens in a new tab.
4. Usage statistics update to reflect the access.

### Search Flow
1. User types in the search input.
2. System performs relevance-scored search across all indexed fields.
3. Results display sorted by score, with matched fields highlighted.
4. System records `search-hit` events for bookmarks that appear in results.

### Sync Trigger
1. Automatic sync fires every 30 minutes via Chrome alarms API.
2. Manual sync available from the popup or options page.
3. Sync pipeline: Fetch -> Merge -> Categorize -> Relate -> Index -> Persist.

## Future UX Enhancements

- **Semantic search input:** Natural language queries ("articles about machine learning from last month").
- **Visual knowledge map:** Interactive graph visualization of bookmark relationships.
- **Quick actions:** Right-click context menu for "Save to Capybara" from any page.
- **Digest view:** Weekly summary of saved knowledge with insights and suggestions.
- **Keyboard shortcuts:** Cmd/Ctrl+Shift+K to open Capybara search from any tab.
