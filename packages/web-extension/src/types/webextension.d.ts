interface BrowserStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface BrowserStorage {
  local: BrowserStorageArea;
}

interface Browser {
  storage: BrowserStorage;
}

declare const browser: Browser;

declare const chrome: {
  storage?: BrowserStorage;
} | undefined;
