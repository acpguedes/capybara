# Capybara

Capybara is a browser extension that unifies bookmarks from multiple browsers into a single, searchable library. The project is intentionally lightweight today, but its architecture is designed to grow into a dependable companion for people who maintain browser workflows across devices and ecosystems.

## Quick Start

### Prerequisites

- **Node.js** 20 LTS or later
- **npm** (bundled with Node.js)
- **Git** 2.x+
- A Chromium-based browser (Chrome 110+ or Edge 110+) for loading the extension

### 1. Clone and Install

```bash
git clone <repository-url> capybara
cd capybara/packages/web-extension
npm install
```

> **Tip:** If `npm install` fails with peer-dependency errors (common on npm 7+), retry with the legacy resolver:
>
> ```bash
> npm install --legacy-peer-deps
> ```

### 2. Build

```bash
npm run build
```

This type-checks the project (`tsc --noEmit`) and bundles everything into `dist/`.

### 3. Load the Extension in Your Browser

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `packages/web-extension/dist` folder (created by the build step).
4. The Capybara icon appears in the toolbar. Click it to search your bookmarks.

### 4. Open the Configuration Pages

Capybara has two user-facing pages:

- **Popup (quick search):** Click the Capybara icon in the browser toolbar.
- **Options / Settings:** Right-click the Capybara icon and select **Options**. Alternatively, go to `chrome://extensions`, find Capybara, click **Details** → **Extension options**. On Firefox, visit `about:addons` and click **Preferences** on the Capybara entry.

From the options page you can configure AI categorization, multi-device sync, and review the Quick Start guide.

### 5. Database (automatic)

Capybara uses **Dexie.js** (IndexedDB) as its local database. The database is created automatically the first time the extension loads — no manual setup is required. All bookmarks, categories, and preferences are stored locally in your browser.

### 6. Configure LLM Categorization (optional)

To enable AI-powered bookmark categorization, you need an API key from a supported provider:

| Provider | Where to get a key | Default model |
|---|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/) | `claude-sonnet-4-20250514` |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.0-flash` |
| Ollama (local) | [ollama.com](https://ollama.com/) — no key needed | `llama3.2` |
| Custom endpoint | Any OpenAI-compatible URL | (user-defined) |

1. Open the **Options** page (step 4 above).
2. Go to the **LLM Configuration** tab.
3. Select your provider, paste the API key, and click **Save LLM settings**.
4. Approve the host permission prompt from the browser.

See the full [LLM Configuration Guide](docs/configuration/llm-setup.md) for provider-specific details.

### 7. Verify

```bash
npm run lint    # ESLint — should show 0 errors
npm run test    # Build + unit tests — should all pass
```

### Development Server

```bash
npm run serve   # Preview server on http://localhost:4173
npm run demo    # Headless Chromium + preview server + DevTools on :9222
```

When using the dev server, access the popup at `http://localhost:4173/popup/` and the options page at `http://localhost:4173/options/`.

For a complete environment setup, see the [Environment Setup Guide](docs/setup/environment.md).

## Vision

Deliver a privacy-conscious bookmark hub that mirrors the calm, helpful nature of its namesake: effortless setup, no data lock-in, and instant recall of the things you save online. Capybara should feel invisible when you do not need it and unmissable when you do.

## Feature Highlights

- **Cross-browser merging:** Deduplicate bookmarks coming from Chromium and Firefox providers while preserving unique entries.
- **Automatic organization:** Derive categories from tags or hostnames so similar links cluster together even without manual filing.
- **Instant search:** Query titles, URLs, and categories entirely client-side via the shared search index.
- **Friendly UI surfaces:** React-driven popup and options pages keep interactions simple while leaving room for advanced features.
- **On-demand LLM enrichment:** Host permissions for external LLM endpoints are only requested after you enable the optional categorization feature and provide a URL, keeping the base extension free of third-party access.

## Architecture Summary

```
Fetch (browser APIs) → Merge (deduplicate) → Categorize (tag) → Index (search) → Render (UI)
```

- **Background sync:** [`src/background/index.ts`](packages/web-extension/src/background/index.ts) orchestrates multi-browser synchronization using provider modules under `src/background/bookmark-sync`.
- **Domain services:** [`merger.ts`](packages/web-extension/src/domain/services/merger.ts), [`categorizer.ts`](packages/web-extension/src/domain/services/categorizer.ts), and [`search.ts`](packages/web-extension/src/domain/services/search.ts) compose the data pipeline feeding the UI.
- **Interfaces:** The popup [`App`](packages/web-extension/src/popup/App.tsx) surfaces indexed bookmarks, while the options [`Settings`](packages/web-extension/src/options/settings.tsx) component demonstrates configuration hooks.

A deeper architectural breakdown is available in [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Documentation

| Guide | Description |
|---|---|
| [Environment Setup](docs/setup/environment.md) | Prerequisites, installation, first build |
| [Development Workflow](docs/setup/development-workflow.md) | Daily commands, testing, code conventions |
| [Troubleshooting](docs/setup/troubleshooting.md) | Common issues and solutions |
| [Architecture Overview](docs/architecture/overview.md) | System design and data flow |
| [Database Architecture](docs/architecture/database.md) | Storage layer, schema, and cloud sync strategy |
| [LLM Configuration](docs/configuration/llm-setup.md) | Optional AI categorization setup |
| [Sync Protocol](docs/sync/protocol.md) | Synchronization workflow and providers |
| [UX Reference](docs/ux/experience.md) | User-facing behavior standards |
| [Operations Playbook](docs/operations/runbook.md) | Quality gates, release, incident response |

## Docker

Run the browser-enabled test environment in Docker when you want an isolated Chromium install or a reproducible CI-like setup.

```bash
docker compose build                                    # Build image
docker compose run --rm web-extension npm run test      # Run tests
docker compose up web-extension                         # Demo server on :4173, DevTools on :9222
```

The container serves static assets on `http://127.0.0.1:4173` and launches Chromium in headless mode with remote debugging on port `9222`. Visit `http://127.0.0.1:4173/popup/` for the popup UI or `http://127.0.0.1:4173/options/` for the options screen.

For an interactive shell:

```bash
docker compose run --rm --service-ports web-extension bash
```

Or use the helper script:

```bash
./scripts/run-docker-tests.sh
```

## Branding & Assets

- SVG masters live in `packages/web-extension/public/icons/`.
- PNG renditions are generated during the build by `scripts/generate-icons.mjs`.
- Run `node ./scripts/generate-icons.mjs` from `packages/web-extension/` to refresh PNGs manually.

## Contributing

Contributions are welcome. Open an issue or pull request describing the problem you are solving, reference the relevant docs, and keep the README up to date as capabilities evolve.

When you need to install or update dependencies, run `npm install` from `packages/web-extension/` and commit the resulting `package-lock.json` alongside your changes.

### Quality Gate (run before every PR)

```bash
cd packages/web-extension && npm run lint && npm run test
```
