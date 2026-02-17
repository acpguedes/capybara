import type {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse
} from "../../models/llm-provider";

export function createOpenAIProvider(
  endpoint: string,
  apiKey: string,
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
        max_tokens: request.maxTokens ?? 4096,
        response_format: { type: "json_object" }
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (apiKey.length > 0) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `OpenAI request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenAI response did not contain a valid completion");
      }

      return { content };
    }
  };
}
