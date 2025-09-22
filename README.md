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

Contributions are welcome—open an issue or pull request describing the problem you are solving, reference the relevant docs, and keep the README up to date as capabilities evolve.

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

To keep the container alive for repeated runs (for example, while debugging against the exposed Chrome DevTools port 9222), start it in attached mode:

```bash
docker compose up
```

Test results are streamed to your terminal output. Repository changes in your local workspace are mounted into the container, so edits on the host are immediately reflected inside Docker.

For a one-step wrapper, use the optional helper script:

```bash
./scripts/run-docker-tests.sh
```

Pass additional arguments to run different commands, e.g., `./scripts/run-docker-tests.sh npm run build`.
