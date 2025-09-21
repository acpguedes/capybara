import { LLM_CONFIGURATION_STORAGE_KEY, type LLMConfiguration } from "../models/llm-configuration";

function normalizeConfiguration(raw: unknown): LLMConfiguration | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Partial<LLMConfiguration>;

  return {
    enabled: Boolean(value.enabled),
    endpoint: typeof value.endpoint === "string" ? value.endpoint : "",
    apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
    model: typeof value.model === "string" ? value.model : undefined
  };
}

export async function loadLLMConfiguration(): Promise<LLMConfiguration | null> {
  const stored = await browser.storage.local.get(LLM_CONFIGURATION_STORAGE_KEY);
  return normalizeConfiguration(stored[LLM_CONFIGURATION_STORAGE_KEY]);
}

export async function saveLLMConfiguration(configuration: LLMConfiguration): Promise<void> {
  await browser.storage.local.set({
    [LLM_CONFIGURATION_STORAGE_KEY]: configuration
  });
}
