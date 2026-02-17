# CLAUDE.md

Reference for AI assistants working on this repository.

## Project Overview

Capybara is a **cross-browser WebExtension** (Manifest V3) that unifies bookmarks from multiple browsers into a single, searchable library. It is privacy-first—no third-party data leaves the client unless the user explicitly enables optional LLM-based categorization.

The codebase lives in a monorepo with the main extension package at `packages/web-extension/`.

## Repository Layout

```
capybara/
├── packages/web-extension/     # Main extension code
│   ├── src/
│   │   ├── background/         # Service worker: sync orchestration
│   │   │   ├── index.ts        # Entry point — synchronizeBookmarks()
│   │   │   └── bookmark-sync/  # Browser-specific providers
│   │   │       ├── chromium-provider.ts
│   │   │       ├── firefox-provider.ts
│   │   │       ├── provider-result.ts
│   │   │       ├── environment.ts
│   │   │       └── bookmark-tree.ts
│   │   ├── domain/
│   │   │   ├── models/         # TypeScript interfaces (Bookmark, SyncSettings, etc.)
│   │   │   └── services/       # Pure business logic
│   │   │       ├── merger.ts              # Bookmark deduplication
│   │   │       ├── categorizer.ts         # Category derivation (tags / hostname)
│   │   │       ├── llm-categorizer.ts     # Optional LLM enrichment
│   │   │       ├── search.ts              # In-memory search index
│   │   │       ├── extension-storage.ts   # Browser storage abstraction
│   │   │       ├── sync-settings.ts       # Sync prefs persistence
│   │   │       ├── llm-settings.ts        # LLM config persistence
│   │   │       └── bookmark-snapshot-crypto.ts  # Optional encryption
│   │   ├── popup/              # Popup UI (React) — quick search
│   │   ├── options/            # Options page (React) — configuration
│   │   ├── shared/             # Runtime messages, permission helpers
│   │   └── types/              # TypeScript shims (WebExtension, React, Node test)
│   ├── public/                 # Static assets (HTML, icons SVGs)
│   ├── scripts/                # Build, serve, demo, icon generation (JS/MJS)
│   ├── manifest.json           # Extension manifest (MV3)
│   ├── package.json
│   ├── tsconfig.json
│   └── eslint.config.mjs
├── docs/                       # Architecture, sync protocol, UX, operations
├── scripts/                    # Repo-level utilities (packaging, Docker helpers)
├── docker-compose.yml
├── Dockerfile
└── .github/workflows/
    └── web-extension.yml       # CI pipeline
```

## Tech Stack

| Area | Technology |
|------|-----------|
| Language | TypeScript (strict mode, ES2021 target) |
| UI | React 18.2 with JSX (react-jsx transform) |
| Bundler | esbuild 0.21 |
| Test runner | Node.js built-in `test` module via `tsx` |
| Linter | ESLint (flat config) with TypeScript, React, React Hooks, and jsx-a11y plugins |
| Package manager | npm (lockfile committed) |
| Module system | CommonJS package type, ESNext modules in source via bundler resolution |
| Extension spec | Manifest V3 |

## Common Commands

All commands run from `packages/web-extension/`:

```bash
npm install                # Install dependencies
npm run build              # Type-check (tsc --noEmit) + bundle via esbuild
npm run lint               # ESLint on src/**/*.{ts,tsx}
npm run test               # Build then run all unit tests
npm run verify:jsx         # Validate JSX build output
npm run serve              # Development server
npm run demo               # Interactive demo with headless Chromium
npm run package            # Create distributable .zip
```

### Quality gate (run before every PR)

```bash
cd packages/web-extension && npm run lint && npm run test
```

CI runs: `lint` → `test` → `verify:jsx` on Node 20 / ubuntu-latest.

## Testing

- **Framework:** Node.js built-in `test` module (`node:test`), executed via `tsx --test`.
- **Location:** Tests are colocated with source in `__tests__/` directories with `.test.ts` suffix.
- **Test directories:**
  - `src/domain/services/__tests__/`
  - `src/background/bookmark-sync/__tests__/`
  - `src/background/__tests__/`
  - `src/popup/__tests__/`
  - `src/options/__tests__/`
- **Mocking pattern:** Dependency injection via setter functions (e.g., `setSynchronizeBookmarksDependencies()`, `setSearchSyncSettingsLoader()`). No external mocking library.
- **Running a single test file:** `npx tsx --test src/domain/services/__tests__/merger.test.ts`

## Architecture

### Data Pipeline

```
Fetch (browser APIs) → Merge (deduplicate) → Categorize (tag) → Index (search) → Render (UI)
```

1. **Background service worker** (`src/background/index.ts`) calls `synchronizeBookmarks()`, which invokes Chromium and Firefox providers concurrently.
2. **Merger** (`src/domain/services/merger.ts`) deduplicates bookmarks by URL.
3. **Categorizer** (`src/domain/services/categorizer.ts`) assigns categories from tags or hostname fallback.
4. **Search** (`src/domain/services/search.ts`) builds an in-memory index for the popup.
5. **Popup** (`src/popup/App.tsx`) renders search results; **Options** (`src/options/settings.tsx`) manages settings.

### Key Design Patterns

- **Provider abstraction:** Each browser has its own provider module returning `ProviderResult` with availability status.
- **Dependency injection for testing:** Services expose `set*Dependencies()` functions to swap real implementations for stubs.
- **Browser API abstraction:** `extension-storage.ts` wraps `chrome.storage` / `browser.storage` for cross-browser compatibility.
- **Minimal React shims:** Custom `.d.ts` type shims keep the React footprint small.

## Conventions

- **TypeScript strict mode** is enforced; do not weaken strictness.
- **Functional components with hooks** for all React UI code.
- **No external test mocking library**—use the existing DI setter pattern.
- **Domain models** are TypeScript interfaces in `src/domain/models/`.
- **Services** are pure functions or modules in `src/domain/services/`.
- **Tests colocated** in `__tests__/` directories adjacent to the code they test.
- **ESLint flat config** with type-checked rules. `chrome` and `browser` are global readonly variables.
- **Ignored by lint/TS:** `dist/` and `scripts/` directories.
- **Icons:** SVG masters in `public/icons/`, PNGs generated during build.
- **Commits:** Install dependencies with `npm install` from `packages/web-extension/` and commit `package-lock.json` alongside changes.

## Permissions Model

- **Required:** `bookmarks`, `storage` (declared in manifest).
- **Optional:** `https://*/*` host permissions—requested only when the user enables LLM categorization.

## Docker

A containerized environment is available for isolated testing:

```bash
docker compose build                                    # Build image
docker compose run --rm web-extension npm run test      # Run tests
docker compose up web-extension                         # Demo server on :4173, DevTools on :9222
```

## Documentation

Detailed docs are in the `docs/` directory:

- `docs/architecture/overview.md` — Component map and data flow
- `docs/sync/protocol.md` — Synchronization workflow and provider contracts
- `docs/ux/experience.md` — UX reference for user-facing behaviors
- `docs/operations/runbook.md` — Local dev, quality gates, release checklist
