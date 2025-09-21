export interface LLMConfiguration {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model?: string;
}

export const LLM_CONFIGURATION_STORAGE_KEY = "llmConfiguration";
