# Environment Setup Guide

This guide walks you through configuring your development environment to work on the Capybara browser extension.

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or later | Runtime for build tools, tests, and dev server |
| npm | Bundled with Node.js | Package management (lockfile committed) |
| Git | 2.x+ | Version control |
| Chromium-based browser | Chrome 110+ or Edge 110+ | Loading and testing the unpacked extension |
| Docker *(optional)* | 20.x+ | Containerized testing and demo environment |

### Verifying Prerequisites

```bash
node --version    # Expected: v20.x or later
npm --version     # Expected: 10.x or later
git --version     # Expected: 2.x or later
```

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url> capybara
cd capybara
```

### 2. Install Dependencies

All extension code lives under `packages/web-extension/`. Install from there:

```bash
cd packages/web-extension
npm install
```

This generates `node_modules/` and updates `package-lock.json`. The lockfile is committed to the repository to guarantee deterministic builds.

### 3. Verify the Installation

Run the quality gate to confirm everything is working:

```bash
npm run lint      # ESLint on src/**/*.{ts,tsx}
npm run test      # Type-check + build + run all unit tests
```

A healthy setup should show:
- **Lint**: 0 errors (1 warning about a React Hook dependency is expected)
- **Tests**: 63 tests passing, 0 failures

## Project Structure

```
capybara/
├── packages/web-extension/     # Main extension source
│   ├── src/                    # TypeScript / React source code
│   │   ├── background/         # Service worker (sync engine)
│   │   ├── domain/             # Models and business logic
│   │   ├── popup/              # Popup UI (React)
│   │   ├── options/            # Settings page (React)
│   │   ├── shared/             # Cross-module utilities
│   │   └── types/              # TypeScript declaration shims
│   ├── public/                 # Static HTML, icons (SVG masters)
│   ├── scripts/                # Build, serve, demo, icon generation
│   ├── dist/                   # Build output (generated, git-ignored)
│   ├── manifest.json           # Extension manifest (Manifest V3)
│   ├── package.json            # Dependencies and scripts
│   ├── tsconfig.json           # TypeScript configuration
│   └── eslint.config.mjs       # ESLint flat config
├── docs/                       # Documentation
├── scripts/                    # Repository-level utilities
├── Dockerfile                  # Container image definition
└── docker-compose.yml          # Docker orchestration
```

## Build and Run

### Building the Extension

```bash
npm run build
```

This performs two steps:
1. **Type-check** via `tsc --noEmit` (strict mode, no output files)
2. **Bundle** via esbuild into `dist/` (background, popup, and options entry points)

### Loading in Chrome / Edge

1. Run `npm run build` to generate the `dist/` directory.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `packages/web-extension/` directory (the folder containing `manifest.json`).
5. The Capybara icon appears in the toolbar. Click it to open the popup.

### Development Server

For rapid iteration with a preview server:

```bash
npm run serve
```

This starts an HTTP server on port **4173** that serves the built extension files. Access the popup at `http://localhost:4173/popup/` and options at `http://localhost:4173/options/`.

### Interactive Demo with Chromium

```bash
npm run demo
```

This spawns a headless Chromium instance with remote debugging enabled:
- **Preview**: `http://localhost:4173`
- **DevTools**: `http://localhost:9222`

### Packaging for Distribution

```bash
npm run package
```

Produces `capybara-extension-v<version>.zip` containing all files needed for store submission or sideloading.

## Docker Environment

A containerized environment is provided for isolated testing without polluting your local setup.

### Build the Image

```bash
docker compose build
```

### Run Tests in Docker

```bash
docker compose run --rm web-extension npm run test
```

### Run the Demo Server

```bash
docker compose up web-extension
```

Exposes:
- Port **4173** for the preview server
- Port **9222** for Chrome DevTools remote debugging

## Editor Configuration

### VS Code (Recommended)

Install these extensions for the best experience:
- **ESLint** (`dbaeumer.vscode-eslint`) -- inline lint feedback
- **TypeScript and JavaScript Language Features** (built-in) -- type checking and IntelliSense

The project uses TypeScript strict mode with bundler module resolution. VS Code picks up `tsconfig.json` automatically.

### Other Editors

Ensure your editor supports:
- TypeScript with the `tsconfig.json` at `packages/web-extension/tsconfig.json`
- ESLint with flat config (`eslint.config.mjs`)
- JSX with the `react-jsx` transform (no explicit `React` import needed)

## Next Steps

- [Development Workflow](development-workflow.md) -- daily commands, testing patterns, and code conventions
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
- [LLM Configuration](../configuration/llm-setup.md) -- optional AI categorization setup
- [Architecture Overview](../architecture/overview.md) -- system design and data flow
