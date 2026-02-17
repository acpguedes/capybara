export type LLMProviderType = "openai" | "anthropic" | "gemini" | "ollama" | "custom";

export const LLM_PROVIDER_LABELS: Record<LLMProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
  ollama: "Ollama (Local)",
  custom: "Custom Endpoint"
};

export const DEFAULT_ENDPOINTS: Record<LLMProviderType, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  ollama: "http://localhost:11434/v1/chat/completions",
  custom: ""
};

export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.2",
  custom: ""
};

export interface LLMCompletionRequest {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletionResponse {
  content: string;
}

export interface LLMProvider {
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}
