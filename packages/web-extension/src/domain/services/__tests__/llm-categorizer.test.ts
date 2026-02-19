import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Bookmark } from "../../models/bookmark";
import { categorizeBookmarksWithLLM } from "../llm-categorizer";

type MockFetchCall = [string, RequestInit?];

type MockResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type MockPermissions = {
  contains?: (permissions: { origins?: string[] }) => Promise<boolean> | boolean;
  request?: (permissions: { origins?: string[] }) => Promise<boolean> | boolean;
};

type PermissionCall = {
  method: "contains" | "request";
  origins?: string[];
};

type WarnCall = Parameters<typeof console.warn>;

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-1",
    title: "Machine Learning Weekly",
    url: "https://ml.example.com/articles/1",
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    source: "chromium"
  },
  {
    id: "bookmark-2",
    title: "Cooking with Herbs",
    url: "https://food.example.com/herbs",
    tags: ["cooking"],
    createdAt: "2024-01-02T00:00:00.000Z",
    source: "firefox"
  }
];

function mockStorage(
  configuration: unknown,
  permissions?: MockPermissions,
  categories?: unknown
): void {
  const storageData: Record<string, unknown> = {
    llmConfiguration: configuration
  };

  if (categories !== undefined) {
    storageData.bookmarkCategories = categories;
  }

  const get = async (key: string): Promise<Record<string, unknown>> => {
    if (typeof key === "string" && Object.prototype.hasOwnProperty.call(storageData, key)) {
      return { [key]: storageData[key] };
    }
    return {};
  };

  (globalThis as { browser?: unknown }).browser = {
    storage: {
      local: {
        get,
        set: async (items: Record<string, unknown>) => {
          Object.assign(storageData, items);
        }
      }
    },
    permissions:
      permissions ?? {
        contains: async () => true
      }
  };
}

function createLLMResponse(
  categorizations: Array<{ id: string; category: string; confidence?: number }>,
  newCategories?: Array<{ name: string; description: string }>
): string {
  return JSON.stringify({
    categorizations: categorizations.map((c) => ({
      ...c,
      confidence: c.confidence ?? 0.9
    })),
    newCategories: newCategories ?? []
  });
}

function mockFetch(impl: (...args: MockFetchCall) => Promise<MockResponse>) {
  const calls: MockFetchCall[] = [];
  const fetchMock = async (input: string, init?: RequestInit): Promise<MockResponse> => {
    const call: MockFetchCall = [input, init];
    calls.push(call);
    return impl(input, init);
  };

  (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return { calls };
}

interface ConsoleWarnMock {
  calls: WarnCall[];
}

type ActiveConsoleWarnMock = ConsoleWarnMock & {
  restore: () => void;
};

let activeConsoleWarnMock: ActiveConsoleWarnMock | null = null;

function mockConsoleWarn(): ConsoleWarnMock {
  if (activeConsoleWarnMock) {
    activeConsoleWarnMock.restore();
  }

  const originalWarn = console.warn;
  const calls: WarnCall[] = [];
  const restore = () => {
    console.warn = originalWarn;
  };

  console.warn = ((...args: WarnCall) => {
    calls.push(args);
  }) as typeof console.warn;

  const mock: ActiveConsoleWarnMock = {
    calls,
    restore
  };

  activeConsoleWarnMock = mock;

  return mock;
}

afterEach(() => {
  activeConsoleWarnMock?.restore();
  activeConsoleWarnMock = null;
  delete (globalThis as { browser?: unknown }).browser;
  delete (globalThis as { chrome?: unknown }).chrome;
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("categorizeBookmarksWithLLM", () => {
  it("maps LLM responses onto categorized bookmarks via OpenAI provider", async () => {
    const permissionCalls: PermissionCall[] = [];
    mockStorage(
      {
        enabled: true,
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: "api-key",
        model: "gpt-4o-mini"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push({ method: "contains", ...permissions });
          return true;
        },
        request: async (permissions) => {
          permissionCalls.push({ method: "request", ...permissions });
          return true;
        }
      }
    );

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "Machine Learning" },
      { id: "bookmark-2", category: "Cooking" }
    ]);

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: llmResponseContent } }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(permissionCalls, [
      { method: "contains", origins: ["https://api.openai.com/*"] }
    ]);
    assert.strictEqual(calls.length, 1);
    const [url, init] = calls[0];
    assert.strictEqual(url, "https://api.openai.com/v1/chat/completions");
    assert.ok(init);
    assert.strictEqual(init?.method, "POST");

    const headers = init?.headers as Record<string, string>;
    assert.strictEqual(headers["Authorization"], "Bearer api-key");
    assert.strictEqual(headers["Content-Type"], "application/json");

    const payload = JSON.parse((init?.body ?? "{}") as string) as Record<string, unknown>;
    assert.strictEqual(payload.model, "gpt-4o-mini");
    assert.ok(Array.isArray((payload as { messages?: unknown }).messages));

    assert.deepStrictEqual(categorized, [
      {
        ...bookmarks[0],
        category: "Machine Learning"
      },
      {
        ...bookmarks[1],
        category: "Cooking"
      }
    ]);
  });

  it("maps LLM responses via Anthropic provider", async () => {
    mockStorage(
      {
        enabled: true,
        provider: "anthropic",
        endpoint: "https://api.anthropic.com/v1/messages",
        apiKey: "sk-ant-key",
        model: "claude-sonnet-4-20250514"
      }
    );

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "AI Research" },
      { id: "bookmark-2", category: "Cooking" }
    ]);

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: llmResponseContent }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 1);
    const [url, init] = calls[0];
    assert.strictEqual(url, "https://api.anthropic.com/v1/messages");

    const headers = init?.headers as Record<string, string>;
    assert.strictEqual(headers["x-api-key"], "sk-ant-key");
    assert.strictEqual(headers["anthropic-version"], "2023-06-01");

    assert.deepStrictEqual(categorized, [
      { ...bookmarks[0], category: "AI Research" },
      { ...bookmarks[1], category: "Cooking" }
    ]);
  });

  it("maps LLM responses via Gemini provider", async () => {
    mockStorage(
      {
        enabled: true,
        provider: "gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        apiKey: "gemini-key",
        model: "gemini-2.0-flash"
      }
    );

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "Technology" },
      { id: "bookmark-2", category: "Recipes" }
    ]);

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: llmResponseContent }] }
        }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 1);
    const [url] = calls[0];
    assert.ok(url.includes("gemini-2.0-flash"));
    assert.ok(url.includes("key=gemini-key"));

    assert.deepStrictEqual(categorized, [
      { ...bookmarks[0], category: "Technology" },
      { ...bookmarks[1], category: "Recipes" }
    ]);
  });

  it("requests host permissions when they are not yet granted", async () => {
    const permissionCalls: PermissionCall[] = [];
    mockStorage(
      {
        enabled: true,
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: "api-key",
        model: "gpt-4o-mini"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push({ method: "contains", ...permissions });
          return false;
        },
        request: async (permissions) => {
          permissionCalls.push({ method: "request", ...permissions });
          return true;
        }
      }
    );

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "Machine Learning" },
      { id: "bookmark-2", category: "Cooking" }
    ]);

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: llmResponseContent } }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(permissionCalls, [
      { method: "contains", origins: ["https://api.openai.com/*"] },
      { method: "request", origins: ["https://api.openai.com/*"] }
    ]);
    assert.strictEqual(calls.length, 1);

    assert.deepStrictEqual(categorized, [
      { ...bookmarks[0], category: "Machine Learning" },
      { ...bookmarks[1], category: "Cooking" }
    ]);
  });

  it("falls back to heuristic categories when the feature is disabled", async () => {
    const warnMock = mockConsoleWarn();
    const permissionCalls: PermissionCall[] = [];
    mockStorage(
      {
        enabled: false,
        provider: "openai",
        endpoint: "https://api.openai.com",
        apiKey: "token",
        model: "gpt-4o-mini"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push({ method: "contains", ...permissions });
          return true;
        },
        request: async (permissions) => {
          permissionCalls.push({ method: "request", ...permissions });
          return true;
        }
      }
    );

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({ choices: [] }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(permissionCalls.length, 0);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
    assert.strictEqual(warnMock.calls.length, 0);
  });

  it("falls back to heuristic categories when the LLM request fails", async () => {
    const warnMock = mockConsoleWarn();
    mockStorage({
      enabled: true,
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "token",
      model: "gpt-4o-mini"
    });

    const { calls } = mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "Internal Server Error"
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
    assert.strictEqual(warnMock.calls.length, 1);
    const warnCall = warnMock.calls[0];
    assert.ok(warnCall);
    const [message, error] = warnCall;
    assert.strictEqual(message, "Falling back to heuristic categorizer due to LLM error");
    assert.ok(error instanceof Error);
  });

  it("falls back to heuristic categories when the endpoint URL is invalid", async () => {
    const warnMock = mockConsoleWarn();
    const permissionCalls: PermissionCall[] = [];
    mockStorage(
      {
        enabled: true,
        provider: "openai",
        endpoint: "not-a-valid-url",
        apiKey: "token",
        model: "gpt-4o-mini"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push({ method: "contains", ...permissions });
          return true;
        },
        request: async (permissions) => {
          permissionCalls.push({ method: "request", ...permissions });
          return true;
        }
      }
    );

    const { calls } = mockFetch(async () => {
      throw new Error("LLM should not be contacted when the endpoint is invalid");
    });

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(permissionCalls.length, 0);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
    assert.strictEqual(warnMock.calls.length, 0);
  });

  it("falls back to heuristic categories when host permissions are missing", async () => {
    const warnMock = mockConsoleWarn();
    const permissionCalls: PermissionCall[] = [];
    mockStorage(
      {
        enabled: true,
        provider: "openai",
        endpoint: "https://blocked.example.com/v1",
        apiKey: "token",
        model: "gpt-4o-mini"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push({ method: "contains", ...permissions });
          return false;
        },
        request: async (permissions) => {
          permissionCalls.push({ method: "request", ...permissions });
          return false;
        }
      }
    );

    const { calls } = mockFetch(async () => {
      throw new Error("LLM should not be contacted without host permissions");
    });

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(permissionCalls, [
      { method: "contains", origins: ["https://blocked.example.com/*"] },
      { method: "request", origins: ["https://blocked.example.com/*"] }
    ]);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
    assert.strictEqual(warnMock.calls.length, 1);
    const warnCall = warnMock.calls[0];
    assert.ok(warnCall);
    const [message, error] = warnCall;
    assert.strictEqual(message, "Falling back to heuristic categorizer due to LLM error");
    assert.ok(error instanceof Error);
  });

  it("uses heuristic values for bookmarks missing in the LLM response", async () => {
    mockStorage({
      enabled: true,
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "token",
      model: "gpt-4o-mini"
    });

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "AI" }
    ]);

    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: llmResponseContent } }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(categorized, [
      {
        ...bookmarks[0],
        category: "AI"
      },
      {
        ...bookmarks[1],
        category: "cooking"
      }
    ]);
  });

  it("persists new categories discovered by the LLM", async () => {
    const storageWrites: Record<string, unknown>[] = [];
    const storageData: Record<string, unknown> = {
      llmConfiguration: {
        enabled: true,
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: "token",
        model: "gpt-4o-mini"
      }
    };

    (globalThis as { browser?: unknown }).browser = {
      storage: {
        local: {
          get: async (key: string) => {
            if (typeof key === "string" && Object.prototype.hasOwnProperty.call(storageData, key)) {
              return { [key]: storageData[key] };
            }
            return {};
          },
          set: async (items: Record<string, unknown>) => {
            storageWrites.push({ ...items });
            Object.assign(storageData, items);
          }
        }
      },
      permissions: { contains: async () => true }
    };

    const llmResponseContent = JSON.stringify({
      categorizations: [
        { id: "bookmark-1", category: "AI Research", confidence: 0.95 },
        { id: "bookmark-2", category: "Cooking", confidence: 0.9 }
      ],
      newCategories: [
        { name: "AI Research", description: "Artificial intelligence and machine learning research" },
        { name: "Cooking", description: "Recipes and culinary techniques" }
      ]
    });

    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: llmResponseContent } }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(categorized[0].category, "AI Research");
    assert.strictEqual(categorized[1].category, "Cooking");

    const categoryWrite = storageWrites.find((w) =>
      Object.prototype.hasOwnProperty.call(w, "bookmarkCategories")
    );
    assert.ok(categoryWrite, "Should have written categories to storage");
    const savedCategories = categoryWrite!.bookmarkCategories as Array<{ name: string }>;
    assert.ok(Array.isArray(savedCategories));
    assert.ok(savedCategories.some((c) => c.name === "AI Research"));
    assert.ok(savedCategories.some((c) => c.name === "Cooking"));
  });

  it("allows http://localhost endpoints for Ollama provider", async () => {
    mockStorage(
      {
        enabled: true,
        provider: "ollama",
        endpoint: "http://localhost:11434/v1/chat/completions",
        apiKey: "",
        model: "llama3.2"
      },
      { contains: async () => true }
    );

    const llmResponseContent = createLLMResponse([
      { id: "bookmark-1", category: "Technology" },
      { id: "bookmark-2", category: "Food" }
    ]);

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: llmResponseContent } }]
      }),
      text: async () => ""
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 1);
    const [url] = calls[0];
    assert.strictEqual(url, "http://localhost:11434/v1/chat/completions");

    assert.strictEqual(categorized[0].category, "Technology");
    assert.strictEqual(categorized[1].category, "Food");
  });
});
