import { LLM_CONFIGURATION_STORAGE_KEY, type LLMConfiguration } from "../models/llm-configuration";
import type { LLMProviderType } from "../models/llm-provider";
import { getItem, setItem } from "./extension-storage";

const VALID_PROVIDERS: LLMProviderType[] = ["openai", "anthropic", "gemini", "ollama", "custom"];

function isValidProvider(value: unknown): value is LLMProviderType {
  return typeof value === "string" && VALID_PROVIDERS.includes(value as LLMProviderType);
}

function normalizeConfiguration(raw: unknown): LLMConfiguration | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Partial<LLMConfiguration> & { model?: string };

  return {
    enabled: Boolean(value.enabled),
    provider: isValidProvider(value.provider) ? value.provider : "openai",
    endpoint: typeof value.endpoint === "string" ? value.endpoint : "",
    apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
    model: typeof value.model === "string" ? value.model : ""
  };
}

export async function loadLLMConfiguration(): Promise<LLMConfiguration | null> {
  const stored = await getItem(LLM_CONFIGURATION_STORAGE_KEY);
  return normalizeConfiguration(stored);
}

export async function saveLLMConfiguration(configuration: LLMConfiguration): Promise<void> {
  await setItem(LLM_CONFIGURATION_STORAGE_KEY, configuration);
}
