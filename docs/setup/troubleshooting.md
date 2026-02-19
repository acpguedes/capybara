# Troubleshooting

Common issues and solutions when developing the Capybara extension.

## Build Issues

### `tsc` reports type errors

**Symptoms**: `npm run build` fails during the type-check phase.

**Solutions**:
1. Ensure you have installed dependencies: `npm install` from `packages/web-extension/`.
2. Verify your Node.js version is 20 or later: `node --version`.
3. Check that `tsconfig.json` has not been modified from the repository version.
4. If you added new `.ts` or `.tsx` files, make sure they are under `src/` (the `include` pattern is `src/**/*.ts`).

### esbuild bundle fails

**Symptoms**: Build succeeds on type-check but fails during bundling.

**Solutions**:
1. Check that all imports resolve correctly. The project uses bundler module resolution.
2. If you added a new entry point, update `scripts/build.mjs` to include it.
3. Run `npm run verify:jsx` to check which output files are missing.

### ESLint cannot load config

**Symptoms**: `npm run lint` throws an error about loading `eslint.config.mjs`.

**Solutions**:
1. Ensure you are running from `packages/web-extension/` (the config is relative).
2. Verify ESLint and its plugins are installed: check `node_modules/.bin/eslint` exists.
3. The project uses ESLint flat config format. Older ESLint versions (< 8.57) may not support it.

## Test Issues

### Tests fail with "Extension storage is unavailable"

**Symptoms**: Storage-related tests throw errors about missing `browser.storage` or `chrome.storage`.

**Explanation**: Tests that interact with storage need mock globals set up. The test infrastructure injects mock storage via the dependency injection setters.

**Solution**: Follow the DI pattern used in existing tests. Set up mock storage before each test and clean up after:

```typescript
beforeEach(() => {
  const globals = globalThis as Record<string, unknown>;
  globals.browser = {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} }
    }
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).browser;
});
```

### Tests hang or timeout

**Symptoms**: `npm run test` does not finish or individual tests timeout.

**Solutions**:
1. Check for unresolved promises in test code.
2. Ensure all `setTimeout` / `setInterval` calls are cleaned up in `afterEach`.
3. Run a single test file to isolate the issue: `npx tsx --test path/to/test.ts`.

### Tests pass locally but fail in CI

**Symptoms**: CI pipeline reports failures that do not reproduce locally.

**Solutions**:
1. Check the Node.js version. CI uses Node 20 -- run `nvm use 20` locally.
2. Delete `node_modules/` and `package-lock.json`, then `npm install` to get a clean dependency tree.
3. Run `npm run build` before `npm run test` (the test script does this, but ensure the build is clean).

## Extension Loading Issues

### "Manifest file is missing or unreadable"

**Symptoms**: Chrome shows an error when loading the unpacked extension.

**Solution**: Point Chrome to the `packages/web-extension/` directory (where `manifest.json` is), not to `dist/` or the root `capybara/` directory.

### Extension loads but popup is blank

**Symptoms**: Clicking the Capybara icon shows an empty popup.

**Solutions**:
1. Run `npm run build` to ensure `dist/popup/index.html` and `dist/popup/index.js` exist.
2. Open `chrome://extensions`, find Capybara, and click **Inspect views: popup** to see console errors.
3. Run `npm run verify:jsx` to confirm all expected output files are present.

### "Extension storage is unavailable" in the browser console

**Symptoms**: Background service worker logs storage errors.

**Explanation**: The extension needs `storage` permission declared in `manifest.json`. This should already be present.

**Solution**: Reload the extension from `chrome://extensions`. If the error persists, check that `manifest.json` includes `"permissions": ["bookmarks", "storage"]`.

## Docker Issues

### Docker build fails

**Symptoms**: `docker compose build` errors during image creation.

**Solutions**:
1. Ensure Docker is running: `docker info`.
2. Check available disk space. The image includes Node.js LTS and Chromium.
3. If you see network errors, check your internet connection and retry.

### Port conflicts

**Symptoms**: `docker compose up` fails because ports 4173 or 9222 are already in use.

**Solution**: Stop any other services using those ports, or modify `docker-compose.yml` to map different host ports:

```yaml
ports:
  - "5173:4173"    # Map to a different host port
  - "9223:9222"
```

## LLM Categorization Issues

See the dedicated [LLM Configuration Guide](../configuration/llm-setup.md) for provider-specific troubleshooting.

### Common LLM Issues

| Symptom | Solution |
|---|---|
| Permission denied on save | Click Save again and approve the host permission prompt |
| Categories not appearing | Verify LLM is enabled, endpoint is reachable, API key is valid |
| Ollama connection refused | Run `ollama serve` and verify with `curl http://localhost:11434/api/tags` |
| "Invalid endpoint" error | URL must use HTTPS (or HTTP for localhost/127.0.0.1 only) |

## Data and Storage Issues

### Bookmarks not syncing across devices

**Explanation**: Cross-device sync requires enabling sync in the options page. Bookmarks are stored in `chrome.storage.sync` only when sync is enabled.

**Steps**:
1. Open the extension options page.
2. Enable **Multi-device synchronization**.
3. Optionally set a passphrase (same passphrase on all devices).
4. Click **Save Sync Settings**.

### Cannot decrypt bookmarks after reinstall

**Explanation**: If sync was enabled with platform-derived keys (no user passphrase), the encryption key is unique to each installation. After reinstall, the old key is lost.

**Solution**: Set a user passphrase before reinstalling. The passphrase is used to derive the encryption key, so the same passphrase on a new installation can decrypt the data.

### Extension storage full

**Explanation**: `chrome.storage.sync` has a limit of ~100 KB. Large bookmark libraries may exceed this.

**Solution**: The extension stores compressed and encrypted data to minimize size. If the limit is hit, consider disabling sync or reducing the bookmark library size.
