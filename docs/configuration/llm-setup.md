# LLM Configuration Guide

Capybara supports optional AI-powered bookmark categorization through multiple LLM providers. When enabled, the extension sends bookmark metadata (titles, URLs, and tags) to the configured provider and receives semantic category assignments that evolve dynamically as your library grows.

## Supported Providers

| Provider | Type | API Key Required | Default Model |
|---|---|---|---|
| OpenAI | Cloud | Yes | `gpt-4o-mini` |
| Anthropic (Claude) | Cloud | Yes | `claude-sonnet-4-20250514` |
| Google Gemini | Cloud | Yes | `gemini-2.0-flash` |
| Ollama | Local | No | `llama3.2` |
| Custom Endpoint | Cloud/Local | Depends | (user-defined) |

## Quick Start

1. Open the extension options page (right-click the Capybara icon > **Options**, or navigate to `chrome://extensions` and click **Details > Extension options**).
2. In the **LLM Categorization** section, check **Enable AI categorization**.
3. Select your provider from the dropdown.
4. Fill in the endpoint (pre-populated with the provider default), API key, and model.
5. Click **Save LLM Settings**.
6. The extension will request host permission for the endpoint domain. Approve the permission when prompted.

## Provider Setup

### OpenAI

1. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Select **OpenAI** as the provider.
3. The endpoint is pre-filled: `https://api.openai.com/v1/chat/completions`.
4. Paste your API key (starts with `sk-`).
5. Optionally change the model (e.g., `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`).

### Anthropic (Claude)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/).
2. Select **Anthropic (Claude)** as the provider.
3. The endpoint is pre-filled: `https://api.anthropic.com/v1/messages`.
4. Paste your API key (starts with `sk-ant-`).
5. Optionally change the model (e.g., `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001`).

### Google Gemini

1. Create an API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Select **Google Gemini** as the provider.
3. The endpoint is pre-filled: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
   The `{model}` placeholder is replaced automatically with the model name.
4. Paste your API key.
5. Optionally change the model (e.g., `gemini-2.0-flash`, `gemini-1.5-pro`).

### Ollama (Local)

Ollama runs models entirely on your machine. No API key or cloud connectivity is needed.

1. Install Ollama from [ollama.com](https://ollama.com/).
2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
3. Make sure Ollama is running (`ollama serve` or the desktop app).
4. Select **Ollama (Local)** as the provider.
5. The endpoint is pre-filled: `http://localhost:11434/v1/chat/completions`.
6. No API key is required.
7. Set the model to match what you pulled (e.g., `llama3.2`, `mistral`, `phi3`).

> **Note:** The extension requests `http://localhost/*` permission to reach the Ollama server. This is an optional permission that only activates when you use the Ollama provider.

### Custom Endpoint

Use this for any OpenAI-compatible API (e.g., LM Studio, vLLM, Together AI, or a corporate proxy).

1. Select **Custom Endpoint** as the provider.
2. Enter the full endpoint URL (must use HTTPS, or HTTP for localhost only).
3. Enter the API key if required by the service.
4. Enter the model identifier expected by the service.

The custom provider sends requests in the OpenAI Chat Completions format (`POST` with `model`, `messages`, `temperature`, `max_tokens`).

## How Categorization Works

When the background sync runs, the extension:

1. Collects uncategorized bookmarks and batches them (up to 50 per request).
2. Sends each batch to the configured LLM with a system prompt that instructs the model to assign semantic categories.
3. The LLM returns structured JSON with category assignments and confidence scores.
4. New categories discovered by the LLM are persisted locally so they can be reused in future batches.
5. Bookmarks that the LLM cannot categorize fall back to the heuristic categorizer (tag-based or hostname-based).

The categorization prompt encourages the model to:
- Prefer existing categories for consistency.
- Create new categories only when existing ones are a poor fit.
- Use human-readable, topic-based names (e.g., "Machine Learning", "Recipe Collection") rather than domain-based labels.

## Data Privacy

- **Cloud providers:** Bookmark titles, URLs, and tags are sent to the provider API. No other personal data leaves the device.
- **Ollama:** All data stays on your machine.
- **Storage:** LLM configuration (including the API key) is stored in the browser's local extension storage. It is never synced across devices.
- **Permissions:** The extension only requests host permissions for the specific endpoint you configure. These are optional permissions that you can revoke at any time.

## Troubleshooting

| Symptom | Solution |
|---|---|
| "Permission denied" error when saving | Click **Save** again and approve the host permission prompt from the browser. |
| Categories not appearing | Check that the LLM is enabled, the endpoint is reachable, and the API key is valid. Open the extension's background console for error details. |
| Ollama connection refused | Verify Ollama is running: `curl http://localhost:11434/api/tags`. Start it with `ollama serve` if needed. |
| Slow categorization | Large bookmark libraries are batched automatically. Consider using a faster model (e.g., `gpt-4o-mini`, `gemini-2.0-flash`). |
| Invalid endpoint error | Ensure the URL uses HTTPS (or HTTP only for `localhost`/`127.0.0.1`). The URL must not contain credentials. |

## Configuration Storage

Settings are persisted under the key `llmConfiguration` in `browser.storage.local` with this schema:

```typescript
interface LLMConfiguration {
  enabled: boolean;
  provider: "openai" | "anthropic" | "gemini" | "ollama" | "custom";
  endpoint: string;
  apiKey: string;
  model: string;
}
```

Categories discovered by the LLM are stored under the key `bookmarkCategories` and grow over time.
