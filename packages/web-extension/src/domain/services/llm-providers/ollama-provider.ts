import type {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse
} from "../../models/llm-provider";

/**
 * Ollama exposes an OpenAI-compatible endpoint at /v1/chat/completions.
 * This provider uses that endpoint so it works the same as OpenAI
 * but without requiring an API key.
 */
export function createOllamaProvider(
  endpoint: string,
  model: string
): LLMProvider {
  return {
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const body = {
        model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userMessage }
        ],
        temperature: request.temperature ?? 0.3,
        stream: false,
        format: "json"
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Ollama request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        message?: { content?: string };
      };

      // Support both OpenAI-compatible format and native Ollama format
      const content =
        data.choices?.[0]?.message?.content ??
        data.message?.content;

      if (!content) {
        throw new Error("Ollama response did not contain a valid completion");
      }

      return { content };
    }
  };
}
