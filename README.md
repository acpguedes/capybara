# Capybara

Capybara is a browser extension that unifies bookmarks from multiple browsers into a single, searchable library. The project is intentionally lightweight today, but its architecture is designed to grow into a dependable companion for people who maintain browser workflows across devices and ecosystems.

## Vision

Deliver a privacy-conscious bookmark hub that mirrors the calm, helpful nature of its namesake: effortless setup, no data lock-in, and instant recall of the things you save online. Capybara should feel invisible when you do not need it and unmissable when you do.

## End-to-End Experience

1. The background worker boots and calls `synchronizeBookmarks`, pulling bookmark trees from Chromium- and Firefox-compatible APIs.
2. Domain services merge the payloads, infer categories, and refresh the in-memory search index.
3. The popup UI lets you filter the combined library instantly, while the options surface exposes synchronization controls.
4. Subsequent syncs reuse the same pipeline, making it easy to add manual refresh actions or alarms without changing the data model.

## Feature Highlights

- **Cross-browser merging:** Deduplicate bookmarks coming from Chromium and Firefox providers while preserving unique entries.
- **Automatic organization:** Derive categories from tags or hostnames so similar links cluster together even without manual filing.
- **Instant search:** Query titles, URLs, and categories entirely client-side via the shared search index.
- **Friendly UI surfaces:** React-driven popup and options pages keep interactions simple while leaving room for advanced features.
- **On-demand LLM enrichment:** Host permissions for external LLM endpoints are only requested after you enable the optional categorization feature and provide a URL, keeping the base extension free of third-party access.

## Branding & Assets

- Browser action and installer icons live in `packages/web-extension/public/icons/`.
- SVG masters are committed as `icon-16.svg`, `icon-32.svg`, `icon-48.svg`, and `icon-128.svg`; PNG renditions are generated during the build by `packages/web-extension/scripts/generate-icons.mjs` and emitted into `dist/icons`.
- The build pipeline (`packages/web-extension/scripts/build.mjs`) copies the entire `public` directory into the distributable bundle and then writes the PNG icons so the manifest references stay valid.
- Run `node ./scripts/generate-icons.mjs` from `packages/web-extension/` to refresh the PNGs manually or to emit them into another directory for testing.

## Architecture Summary

- **Background sync:** [`packages/web-extension/src/background/index.ts`](packages/web-extension/src/background/index.ts) orchestrates multi-browser synchronization using provider modules under `src/background/bookmark-sync`.
- **Domain services:** [`merger.ts`](packages/web-extension/src/domain/services/merger.ts), [`categorizer.ts`](packages/web-extension/src/domain/services/categorizer.ts), and [`search.ts`](packages/web-extension/src/domain/services/search.ts) compose the data pipeline feeding the UI.
- **Interfaces:** The popup [`App`](packages/web-extension/src/popup/App.tsx) surfaces indexed bookmarks, while the options [`Settings`](packages/web-extension/src/options/settings.tsx) component demonstrates configuration hooks.

A deeper architectural breakdown is available in [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Implementation Strategy

- Replace the stubbed Chromium and Firefox bookmark providers with production-ready adapters that respect browser permissions.
- Persist synchronization preferences and future options using browser storage APIs.
- Expand the domain layer with unit tests and enrichment services as new features (e.g., deduplicated folders or recents) land.
- Tighten search relevancy with scoring or fuzzy matching once the baseline experience is stable.

## Documentation & Contributions

Detailed guidance lives in the [`docs/`](docs/README.md) directory, covering architecture decisions, synchronization protocol notes, UX expectations, and operational playbooks.

Contributions are welcome—open an issue or pull request describing the problem you are solving, reference the relevant docs, and keep the README up to date as capabilities evolve. When you need to install or update dependencies for the web extension package, run `npm install` from `packages/web-extension/` so the generated `package-lock.json` stays in sync and commit the resulting lockfile alongside your changes.

## Docker usage

Run the browser-enabled test environment in Docker when you want an isolated Chromium install or a reproducible CI-like setup.

### Build the image

```bash
docker compose build
```

### Execute the test suite

Run the default `npm run test` command inside the container:

```bash
docker compose run --rm web-extension
```

To keep the container alive for repeated runs (for example, while debugging against the exposed Chrome DevTools port 9222), drop into an interactive shell while keeping service ports exposed:

```bash
docker compose run --rm --service-ports web-extension bash
```

From that shell you can launch Chromium manually—e.g., `chromium --no-sandbox --headless=new --disable-gpu --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222 --remote-allow-origins=*`—so the DevTools port stays open, or run any npm scripts you need. Chromium requires the `--remote-allow-origins=*` flag because connections from the Docker host are not treated as loopback traffic. The container runs Chromium as the root user without an attached display, so disabling the sandbox and forcing headless mode avoids startup failures caused by Chrome refusing to use GPU acceleration or create a UI session under those conditions. Command output streams directly to your terminal. Repository changes in your local workspace are mounted into the container, so edits on the host are immediately reflected inside Docker.

For a one-step wrapper, use the optional helper script:

```bash
./scripts/run-docker-tests.sh
```

Pass additional arguments to run different commands, e.g., `./scripts/run-docker-tests.sh npm run build`.
