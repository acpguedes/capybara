import type { LLMProviderType } from "./llm-provider";

export interface LLMConfiguration {
  enabled: boolean;
  provider: LLMProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
}

export const LLM_CONFIGURATION_STORAGE_KEY = "llmConfiguration";
