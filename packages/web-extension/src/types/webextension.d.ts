interface BrowserStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface BrowserStorage {
  local: BrowserStorageArea;
  sync?: BrowserStorageArea;
}

interface BrowserRuntimeEvent {
  addListener(callback: (...args: unknown[]) => void): void;
}

interface BrowserRuntime {
  onInstalled?: BrowserRuntimeEvent;
  onStartup?: BrowserRuntimeEvent;
}

interface BrowserAlarm {
  name?: string;
}

interface BrowserAlarms {
  create?(name: string, info: { periodInMinutes: number }): void;
  onAlarm?: {
    addListener(callback: (alarm: BrowserAlarm) => void): void;
  };
}

interface Browser {
  storage: BrowserStorage;
  runtime?: BrowserRuntime;
  alarms?: BrowserAlarms;
}

declare const browser: Browser;

declare const chrome: {
  storage?: BrowserStorage;
  runtime?: BrowserRuntime;
  alarms?: BrowserAlarms;
} | undefined;
