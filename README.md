<p align="center">
  <img src="docs/assets/capybara-logo.png" alt="Capybara" width="200" />
</p>

<h1 align="center">Capybara</h1>

<p align="center">
  <strong>Your personal knowledge companion for the web.</strong><br/>
  A privacy-first browser extension that turns scattered bookmarks into an organized, searchable knowledge library.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript Strict" />
  <img src="https://img.shields.io/badge/React-18.2-61dafb" alt="React 18.2" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/privacy-local--first-blueviolet" alt="Privacy: Local-first" />
</p>

---

## Why Capybara?

Saving bookmarks is easy. **Remembering, connecting, and reusing** them is the hard part.

Capybara is more than a bookmark manager. It's a **personal knowledge system** that lives in your browser:

- **Unifies bookmarks** across Chromium and Firefox into one searchable library
- **Automatically categorizes** your links using tags, domain heuristics, or optional AI enrichment
- **Connects knowledge** by discovering relationships between your saved resources
- **Recalls intelligently** by learning which bookmarks matter most to you
- **Respects your privacy** with local-first storage and optional encrypted sync

Like its namesake, Capybara is calm, reliable, and quietly helpful. It stays invisible when you don't need it and becomes indispensable when you do.

---

## Feature Highlights

| Feature | Description |
|---------|-------------|
| **Cross-browser merging** | Deduplicates bookmarks from Chromium and Firefox, preserving unique entries from each |
| **Smart categorization** | Derives categories from tags, hostnames, or AI-powered semantic analysis |
| **Instant search** | Client-side full-text search across titles, URLs, categories, and tags with relevance scoring |
| **Knowledge relationships** | Discovers connections between bookmarks (same domain, same category, similar content) |
| **Usage intelligence** | Tracks access patterns to surface your most relevant bookmarks when you need them |
| **On-demand LLM enrichment** | Optional AI categorization via OpenAI, Anthropic, Google Gemini, Ollama, or custom endpoints |
| **Encrypted sync** | Optional multi-device synchronization with AES-GCM encryption and PBKDF2 key derivation |
| **Privacy-first** | All data stays local by default. No third-party access unless you explicitly enable it |

---

## How It Works

```
Fetch (browser APIs) --> Merge (deduplicate) --> Categorize (enrich) --> Relate (connect) --> Index (search) --> Render (UI)
```

1. **Fetch** -- Background service worker collects bookmarks from Chromium and Firefox APIs concurrently
2. **Merge** -- Deduplication engine normalizes URLs and combines entries, preserving browser-specific metadata
3. **Categorize** -- Heuristic categorizer assigns labels from tags or hostnames; optional LLM enrichment adds semantic categories
4. **Relate** -- Knowledge graph builder discovers connections between bookmarks by domain, category, and content similarity
5. **Index** -- In-memory search index enables sub-100ms queries with relevance scoring
6. **Render** -- React-driven popup for quick search; options page for configuration and exploration

---

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

### 3. Load the Extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `packages/web-extension/dist` folder.
4. The Capybara icon appears in the toolbar. Click it to search your bookmarks.

### 4. Configure (Optional)

- **Popup (quick search):** Click the Capybara icon in the browser toolbar.
- **Options / Settings:** Right-click the Capybara icon and select **Options**.

From the options page you can configure AI categorization, multi-device sync, and review the Quick Start guide.

### 5. AI Categorization (Optional)

To enable AI-powered bookmark categorization, configure an API key from a supported provider:

| Provider | Where to get a key | Default model |
|---|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/) | `claude-sonnet-4-20250514` |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.0-flash` |
| Ollama (local) | [ollama.com](https://ollama.com/) -- no key needed | `llama3.2` |
| Custom endpoint | Any OpenAI-compatible URL | (user-defined) |

See the full [LLM Configuration Guide](docs/configuration/llm-setup.md) for provider-specific details.

### 6. Verify

```bash
npm run lint    # ESLint -- should show 0 errors
npm run test    # Build + unit tests -- should all pass
```

---

## Architecture

Capybara follows a layered architecture with clear separation between data acquisition, domain logic, and presentation:

| Layer | Responsibility | Key Modules |
|-------|---------------|-------------|
| **Background worker** | Orchestrates multi-browser sync, schedules periodic updates | [`background/index.ts`](packages/web-extension/src/background/index.ts) |
| **Domain models** | TypeScript interfaces for bookmarks, categories, relationships, usage | [`domain/models/`](packages/web-extension/src/domain/models/) |
| **Domain services** | Merge, categorize, relate, search, track -- pure business logic | [`domain/services/`](packages/web-extension/src/domain/services/) |
| **LLM providers** | Multi-provider abstraction for AI categorization | [`domain/services/llm-providers/`](packages/web-extension/src/domain/services/llm-providers/) |
| **Storage** | Cross-browser storage abstraction with encryption support | [`domain/services/extension-storage.ts`](packages/web-extension/src/domain/services/extension-storage.ts) |
| **UI** | React popup (search) and options page (configuration) | [`popup/`](packages/web-extension/src/popup/), [`options/`](packages/web-extension/src/options/) |

A deeper breakdown is available in [`docs/architecture/overview.md`](docs/architecture/overview.md).

---

## Roadmap

Capybara is evolving from a bookmark organizer into a full **personal knowledge management system**. Here's the vision:

### Phase 1 -- Foundation (current)
- [x] Cross-browser bookmark merging (Chromium + Firefox)
- [x] Heuristic and AI-powered categorization
- [x] In-memory search with relevance scoring
- [x] Encrypted multi-device sync
- [x] Bookmark relationship discovery (knowledge graph)
- [x] Usage tracking for intelligent recall

### Phase 2 -- Intelligence
- [ ] Semantic search with embeddings (local or API-based)
- [ ] Auto-generated summaries for saved pages
- [ ] Smart suggestions ("You saved similar content about X")
- [ ] Broken link detection and health monitoring
- [ ] Per-record reclassification history (audit trail)

### Phase 3 -- Knowledge Agent
- [ ] Cross-reference bookmarks with local projects and documents
- [ ] "What's relevant to my current task?" contextual queries
- [ ] Insight generation from bookmark clusters
- [ ] Export knowledge maps as structured documents
- [ ] Safari and mobile browser providers

---

## Documentation

| Guide | Description |
|---|---|
| [Product Vision](docs/vision/product-vision.md) | Strategic direction and knowledge management philosophy |
| [Environment Setup](docs/setup/environment.md) | Prerequisites, installation, first build |
| [Development Workflow](docs/setup/development-workflow.md) | Daily commands, testing, code conventions |
| [Troubleshooting](docs/setup/troubleshooting.md) | Common issues and solutions |
| [Architecture Overview](docs/architecture/overview.md) | System design and data flow |
| [Database Architecture](docs/architecture/database.md) | Storage layer, schema, and cloud sync strategy |
| [LLM Configuration](docs/configuration/llm-setup.md) | Optional AI categorization setup |
| [Sync Protocol](docs/sync/protocol.md) | Synchronization workflow and providers |
| [UX Reference](docs/ux/experience.md) | User-facing behavior standards |
| [Operations Playbook](docs/operations/runbook.md) | Quality gates, release, incident response |

---

## Development

### Commands

All commands run from `packages/web-extension/`:

```bash
npm install                # Install dependencies
npm run build              # Type-check (tsc --noEmit) + bundle via esbuild
npm run lint               # ESLint on src/**/*.{ts,tsx}
npm run test               # Build then run all unit tests
npm run verify:jsx         # Validate JSX build output
npm run serve              # Development server on :4173
npm run demo               # Interactive demo with headless Chromium
npm run package            # Create distributable .zip
```

### Quality Gate (run before every PR)

```bash
cd packages/web-extension && npm run lint && npm run test
```

CI runs: `lint` -> `test` -> `verify:jsx` on Node 20 / ubuntu-latest.

### Docker

Run the browser-enabled test environment in Docker for an isolated, reproducible setup:

```bash
docker compose build                                    # Build image
docker compose run --rm web-extension npm run test      # Run tests
docker compose up web-extension                         # Demo server on :4173, DevTools on :9222
```

---

## Branding & Assets

- **Logo:** [`docs/assets/capybara-logo.png`](docs/assets/capybara-logo.png) (full mascot) and [`docs/assets/capybara-favicon.png`](docs/assets/capybara-favicon.png) (square icon)
- **Extension icons:** SVG masters in `packages/web-extension/public/icons/`, PNGs generated during build
- Run `node ./scripts/generate-icons.mjs` from `packages/web-extension/` to refresh PNGs

---

## Contributing

Contributions are welcome. Open an issue or pull request describing the problem you are solving, reference the relevant docs, and keep the README up to date as capabilities evolve.

When you need to install or update dependencies, run `npm install` from `packages/web-extension/` and commit the resulting `package-lock.json` alongside your changes.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
