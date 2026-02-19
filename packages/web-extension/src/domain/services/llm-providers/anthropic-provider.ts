import type {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse
} from "../../models/llm-provider";

export function createAnthropicProvider(
  endpoint: string,
  apiKey: string,
  model: string
): LLMProvider {
  return {
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const body = {
        model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt,
        messages: [
          { role: "user", content: request.userMessage }
        ]
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      };

      if (apiKey.length > 0) {
        headers["x-api-key"] = apiKey;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Anthropic request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };

      const textBlock = data.content?.find((block) => block.type === "text");
      const content = textBlock?.text;

      if (!content) {
        throw new Error("Anthropic response did not contain a valid text block");
      }

      return { content };
    }
  };
}
