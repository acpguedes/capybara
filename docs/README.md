# Capybara Documentation

This directory captures the technical plan and operating guides that support the Capybara browser extension. Start with the architecture overview, then dive into the synchronization protocol, UX standards, and operational runbooks as needed.

## Getting Started

- [Environment Setup](setup/environment.md) -- prerequisites, installation, and first build
- [Development Workflow](setup/development-workflow.md) -- daily commands, testing, and conventions
- [Troubleshooting](setup/troubleshooting.md) -- common issues and solutions

## Reference

- [Architecture Overview](architecture/overview.md)
- [LLM Configuration Guide](configuration/llm-setup.md)
- [Synchronization Protocol](sync/protocol.md)
- [UX Reference](ux/experience.md)
- [Operations Playbook](operations/runbook.md)

Each document is intentionally scoped so contributors can evolve the implementation without losing sight of the broader product vision.

When working on the web extension package, install dependencies with `npm install` inside `packages/web-extension/` and commit the resulting `package-lock.json` so collaborators share the same dependency graph.
