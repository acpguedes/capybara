import type { LLMConfiguration } from "../../models/llm-configuration";
import type { LLMProvider } from "../../models/llm-provider";
import { createOpenAIProvider } from "./openai-provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { createGeminiProvider } from "./gemini-provider";
import { createOllamaProvider } from "./ollama-provider";

export function createLLMProvider(configuration: LLMConfiguration): LLMProvider {
  const { provider, endpoint, apiKey, model } = configuration;

  switch (provider) {
    case "openai":
      return createOpenAIProvider(endpoint, apiKey, model);

    case "anthropic":
      return createAnthropicProvider(endpoint, apiKey, model);

    case "gemini":
      return createGeminiProvider(endpoint, apiKey, model);

    case "ollama":
      return createOllamaProvider(endpoint, model);

    case "custom":
      // Custom endpoints use the OpenAI-compatible format by default
      return createOpenAIProvider(endpoint, apiKey, model);

    default:
      throw new Error(`Unknown LLM provider: ${String(provider)}`);
  }
}
