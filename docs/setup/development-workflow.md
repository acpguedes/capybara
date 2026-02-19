# Development Workflow

This guide covers the day-to-day commands, testing patterns, and conventions you need when working on Capybara.

## Common Commands

All commands run from `packages/web-extension/`:

| Command | Description |
|---|---|
| `npm run build` | Type-check (tsc) + bundle (esbuild) into `dist/` |
| `npm run lint` | Run ESLint on `src/**/*.{ts,tsx}` |
| `npm run test` | Build then run all unit tests |
| `npm run serve` | Start dev preview server on port 4173 |
| `npm run demo` | Launch headless Chromium with dev server |
| `npm run verify:jsx` | Validate JSX build output files exist |
| `npm run package` | Create distributable `.zip` archive |

## Quality Gate

Run this before every commit or pull request:

```bash
cd packages/web-extension && npm run lint && npm run test
```

CI runs: `lint` -> `test` -> `verify:jsx` on Node 20 / ubuntu-latest.

## Testing

### Framework

Tests use Node.js built-in `node:test` module, executed via `tsx --test`. No external test framework (Jest, Vitest, etc.) is used.

### Test Locations

Tests are colocated with their source code in `__tests__/` directories:

```
src/
├── domain/services/__tests__/
│   ├── merger.test.ts
│   ├── search.test.ts
│   ├── bookmark-snapshot-crypto.test.ts
│   ├── sync-settings.test.ts
│   ├── categorizer.test.ts
│   ├── extension-storage.test.ts
│   ├── llm-categorizer.test.ts
│   └── llm-prompt.test.ts
├── background/__tests__/
│   └── index.test.ts
├── background/bookmark-sync/__tests__/
│   └── bookmark-tree.test.ts
├── popup/__tests__/
│   └── index.test.ts
└── options/__tests__/
    └── settings.test.ts
```

### Running a Single Test

```bash
npx tsx --test src/domain/services/__tests__/merger.test.ts
```

### Mocking Pattern

The project uses **dependency injection** instead of external mocking libraries. Services expose setter functions to swap real implementations for test stubs:

```typescript
// Production code (search.ts)
export function setSearchSyncSettingsLoader(loader: SyncSettingsLoader): void {
  loadSyncSettings = loader;
}

export function resetSearchSyncSettingsLoader(): void {
  loadSyncSettings = defaultLoadSyncSettings;
}

// Test code (search.test.ts)
import { setSearchSyncSettingsLoader, resetSearchSyncSettingsLoader } from "../search";

test("my test", async () => {
  setSearchSyncSettingsLoader(async () => ({ enabled: false, keySource: "platform" }));
  try {
    // ... test logic
  } finally {
    resetSearchSyncSettingsLoader();
  }
});
```

### Writing New Tests

1. Create a `.test.ts` file in the `__tests__/` directory adjacent to the code being tested.
2. Use `import { describe, test, beforeEach, afterEach } from "node:test"` and `import assert from "node:assert/strict"`.
3. If you need to mock a dependency, use the existing DI setter pattern (add a `set*Dependencies()` / `reset*Dependencies()` export).
4. Add the test file path to the `test` script in `package.json` if it's in a new `__tests__/` directory.

## Code Conventions

### TypeScript

- **Strict mode** is enforced. Do not add `@ts-ignore` or weaken type checking.
- **ES2021** target with **ESNext** module system (bundled by esbuild).
- Domain models are **interfaces** in `src/domain/models/`.
- Services are **pure functions or modules** in `src/domain/services/`.

### React

- **Functional components with hooks** only. No class components.
- JSX uses the `react-jsx` automatic transform (no `import React` needed).
- Minimal React shims are in `src/types/` to keep the footprint small.

### Extension APIs

- `chrome` and `browser` are global readonly variables (declared in ESLint config and type shims).
- Use `extension-storage.ts` for all storage operations. Do not call `chrome.storage` directly.
- Use `extension-permissions.ts` for permission requests.

### File Organization

```
src/
├── background/           # Service worker entry point and providers
├── domain/
│   ├── models/           # TypeScript interfaces (data shapes)
│   └── services/         # Business logic (pure functions)
├── popup/                # Popup UI components
├── options/              # Options page components
├── shared/               # Cross-module utilities
└── types/                # TypeScript declaration files (.d.ts)
```

## Data Persistence

The project does **not** use a traditional database. All data persistence is handled through the browser extension's `chrome.storage` / `browser.storage` API, which is a key-value store.

### Storage Keys

| Key | Type | Storage Area | Description |
|---|---|---|---|
| `bookmarkSnapshot` | `BookmarkSnapshotStorageValue` | local + sync (optional) | Merged and categorized bookmarks |
| `syncSettings` | `SyncSettings` | local | Multi-device sync preferences |
| `llmConfiguration` | `LLMConfiguration` | local | LLM provider settings and API keys |
| `bookmarkCategories` | `Category[]` | local | Discovered bookmark categories |
| `bookmarkSnapshotPlatformSecret` | `string` | local | Platform-generated encryption key |

### Storage Abstraction

All storage access goes through `extension-storage.ts`, which provides type-safe `getItem()` and `setItem()` functions. This abstraction:
- Resolves `browser.storage` (Firefox) or `chrome.storage` (Chromium) automatically
- Supports reading from multiple storage areas with fallback ordering
- Supports writing to multiple storage areas simultaneously

## Git Workflow

1. Create a feature branch from `main`.
2. Make changes, run `npm run lint && npm run test`.
3. Commit with a descriptive message.
4. Push and open a pull request.
5. CI will validate lint, tests, and JSX build.

Always commit `package-lock.json` alongside any dependency changes.
