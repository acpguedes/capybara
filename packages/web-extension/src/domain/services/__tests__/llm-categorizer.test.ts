import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Bookmark } from "../../models/bookmark";
import { categorizeBookmarksWithLLM } from "../llm-categorizer";

type MockFetchCall = [string, RequestInit?];

type MockResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

type MockPermissions = {
  contains?: (permissions: { origins?: string[] }) => Promise<boolean> | boolean;
};

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-1",
    title: "Machine Learning Weekly",
    url: "https://ml.example.com/articles/1",
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z"
  },
  {
    id: "bookmark-2",
    title: "Cooking with Herbs",
    url: "https://food.example.com/herbs",
    tags: ["cooking"],
    createdAt: "2024-01-02T00:00:00.000Z"
  }
];

function mockStorage(configuration: unknown, permissions?: MockPermissions): void {
  const get = async (): Promise<Record<string, unknown>> => ({
    llmConfiguration: configuration
  });

  (globalThis as { browser?: unknown }).browser = {
    storage: {
      local: {
        get,
        set: async () => {}
      }
    },
    permissions:
      permissions ?? {
        contains: async () => true
      }
  };
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

afterEach(() => {
  delete (globalThis as { browser?: unknown }).browser;
  delete (globalThis as { chrome?: unknown }).chrome;
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("categorizeBookmarksWithLLM", () => {
  it("maps LLM responses onto categorized bookmarks", async () => {
    const permissionCalls: Array<{ origins?: string[] }> = [];
    mockStorage(
      {
        enabled: true,
        endpoint: "https://api.openai.com/v1/bookmarks",
        apiKey: "api-key",
        model: "bookmark-model"
      },
      {
        contains: async (permissions) => {
          permissionCalls.push(permissions);
          return true;
        }
      }
    );

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({
        categories: [
          { id: "bookmark-1", category: "machine-learning" },
          { id: "bookmark-2", category: "cooking" }
        ]
      })
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(permissionCalls, [{ origins: ["https://api.openai.com/*"] }]);
    assert.strictEqual(calls.length, 1);
    const [url, init] = calls[0];
    assert.strictEqual(url, "https://api.openai.com/v1/bookmarks");
    assert.ok(init);
    assert.strictEqual(init?.method, "POST");
    assert.deepStrictEqual(init?.headers, {
      Authorization: "Bearer api-key",
      "Content-Type": "application/json"
    });

    const payload = JSON.parse((init?.body ?? "{}") as string) as Record<string, unknown>;
    assert.ok(Array.isArray(payload.bookmarks));
    assert.strictEqual(payload.model, "bookmark-model");

    assert.deepStrictEqual(categorized, [
      {
        ...bookmarks[0],
        category: "machine-learning"
      },
      {
        ...bookmarks[1],
        category: "cooking"
      }
    ]);
  });

  it("falls back to heuristic categories when the feature is disabled", async () => {
    mockStorage({ enabled: false, endpoint: "https://api.openai.com", apiKey: "token" });

    const { calls } = mockFetch(async () => ({
      ok: true,
      json: async () => ({ categories: [] })
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
  });

  it("falls back to heuristic categories when the LLM request fails", async () => {
    mockStorage({ enabled: true, endpoint: "https://api.openai.com", apiKey: "token" });

    const { calls } = mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
  });

  it("falls back to heuristic categories when the endpoint URL is invalid", async () => {
    mockStorage({ enabled: true, endpoint: "not-a-valid-url", apiKey: "token" });

    const { calls } = mockFetch(async () => {
      throw new Error("LLM should not be contacted when the endpoint is invalid");
    });

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
  });

  it("falls back to heuristic categories when host permissions are missing", async () => {
    const permissionCalls: Array<{ origins?: string[] }> = [];
    mockStorage(
      { enabled: true, endpoint: "https://blocked.example.com/v1", apiKey: "token" },
      {
        contains: async (permissions) => {
          permissionCalls.push(permissions);
          return false;
        }
      }
    );

    const { calls } = mockFetch(async () => {
      throw new Error("LLM should not be contacted without host permissions");
    });

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.strictEqual(permissionCalls.length, 1);
    assert.deepStrictEqual(permissionCalls[0]?.origins, ["https://blocked.example.com/*"]);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(
      categorized.map((bookmark) => bookmark.category),
      ["example.com", "cooking"]
    );
  });

  it("uses heuristic values for bookmarks missing in the LLM response", async () => {
    mockStorage({ enabled: true, endpoint: "https://api.openai.com", apiKey: "token" });

    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        categories: [{ id: "bookmark-1", category: "ai" }]
      })
    }));

    const categorized = await categorizeBookmarksWithLLM(bookmarks);

    assert.deepStrictEqual(categorized, [
      {
        ...bookmarks[0],
        category: "ai"
      },
      {
        ...bookmarks[1],
        category: "cooking"
      }
    ]);
  });
});
