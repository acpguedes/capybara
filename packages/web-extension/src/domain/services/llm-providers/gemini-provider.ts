import type {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse
} from "../../models/llm-provider";

export function createGeminiProvider(
  endpoint: string,
  apiKey: string,
  model: string
): LLMProvider {
  return {
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const url = endpoint.includes("{model}")
        ? endpoint.replace("{model}", model)
        : endpoint;

      const separator = url.includes("?") ? "&" : "?";
      const urlWithKey = apiKey.length > 0
        ? `${url}${separator}key=${apiKey}`
        : url;

      const body = {
        system_instruction: {
          parts: [{ text: request.systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: request.userMessage }]
          }
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.3,
          maxOutputTokens: request.maxTokens ?? 4096,
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(urlWithKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Gemini request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error("Gemini response did not contain a valid completion");
      }

      return { content };
    }
  };
}
