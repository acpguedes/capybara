# Operations Playbook

Capybara is still early in development, so operational practices focus on maintaining developer velocity and ensuring background synchronization remains reliable as implementations land.

## Local Development

1. Install dependencies inside `packages/web-extension` with `npm install`.
2. Use `npm run dev` (add a script when the build tool is introduced) to watch the extension during development.
3. Load the generated extension directory into Chromium-based browsers via the Extensions page in developer mode.

## Quality Gates

- Unit tests should be colocated with the domain services once their behavior stabilizes.
- Linting via `eslint` will help enforce React and TypeScript conventions; introduce it before shipping the first public beta.
- Manual smoke tests must include background sync, popup queries, and options toggles.

## Release Checklist

1. Verify providers return data and degrade gracefully when APIs are unavailable.
2. Confirm the search index populates and that the popup renders results in Chrome and Firefox.
3. Update the README and docs to reflect any new supported browsers or features.
4. Tag the release in git and document notable changes for extension marketplaces.

## Incident Response

Because the extension runs locally for each user, incidents typically manifest as sync failures or UI regressions:

- Provide troubleshooting steps (clearing caches, re-authenticating browser sync) in user-facing FAQ material.
- Ship logging hooks that can be toggled during support sessions without exposing private bookmark data.
- Maintain an issue template for GitHub to capture browser version, extension build, and reproduction steps.
