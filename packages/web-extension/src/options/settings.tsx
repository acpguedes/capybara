import { FormEvent, useEffect, useRef, useState } from "react";
import {
  LLM_CONFIGURATION_STORAGE_KEY,
  type LLMConfiguration
} from "../domain/models/llm-configuration";
import type { LLMProviderType } from "../domain/models/llm-provider";
import {
  LLM_PROVIDER_LABELS,
  DEFAULT_ENDPOINTS,
  DEFAULT_MODELS
} from "../domain/models/llm-provider";
import { SYNC_SETTINGS_STORAGE_KEY } from "../domain/models/sync-settings";
import { loadLLMConfiguration, saveLLMConfiguration } from "../domain/services/llm-settings";
import { loadSyncSettings, saveSyncSettings } from "../domain/services/sync-settings";
import { ensureHostPermission, getHostPermissionInfo } from "../shared/extension-permissions";
import { RUNTIME_SYNC_NOW_MESSAGE_TYPE } from "../shared/runtime-messages";

type ExtensionRuntime = {
  sendMessage?: (message: unknown) => unknown;
};

type ExtensionGlobals = typeof globalThis & {
  browser?: { runtime?: ExtensionRuntime };
  chrome?: { runtime?: ExtensionRuntime };
};

type TabId = "quickstart" | "llm" | "sync" | "about";

function requestImmediateSynchronization(): void {
  const globals = globalThis as ExtensionGlobals;
  const runtime = globals.browser?.runtime ?? globals.chrome?.runtime;

  if (!runtime?.sendMessage) {
    return;
  }

  try {
    const maybePromise = runtime.sendMessage({
      type: RUNTIME_SYNC_NOW_MESSAGE_TYPE
    }) as { catch?: (onRejected: (reason: unknown) => unknown) => unknown } | void;

    maybePromise?.catch?.((error: unknown) => {
      console.error("Failed to request bookmark synchronization", error);
    });
  } catch (error) {
    console.error("Failed to request bookmark synchronization", error);
  }
}

const PROVIDER_OPTIONS: LLMProviderType[] = ["openai", "anthropic", "gemini", "ollama", "custom"];

const PROVIDER_DESCRIPTIONS: Record<LLMProviderType, string> = {
  openai: "Cloud API",
  anthropic: "Cloud API",
  gemini: "Cloud API",
  ollama: "Local",
  custom: "Any endpoint"
};

function renderQuickStartTab(): JSX.Element {
  return (
    <div>
      <div className="card">
        <h2>Welcome to Capybara</h2>
        <p>
          Capybara unifies bookmarks from multiple browsers into a single, searchable library.
          Get started in a few simple steps.
        </p>
      </div>

      <div className="card">
        <h2>Getting Started</h2>
        <ol className="steps-list">
          <li>
            <span className="step-number">1</span>
            <div className="step-content">
              <h3>Install the extension</h3>
              <p>
                Load the extension in your browser via <code>chrome://extensions</code> (Chromium)
                or <code>about:debugging</code> (Firefox). Enable Developer mode and select the
                <code> dist/</code> folder.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div className="step-content">
              <h3>Click the Capybara icon</h3>
              <p>
                Open the popup from the toolbar to search your bookmarks instantly. The extension
                automatically indexes your browser bookmarks on load.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div className="step-content">
              <h3>Configure AI categorization (optional)</h3>
              <p>
                Go to the <strong>LLM Configuration</strong> tab to connect a cloud provider
                (OpenAI, Anthropic, Gemini) or a local model (Ollama) for automatic bookmark
                categorization.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div className="step-content">
              <h3>Enable multi-device sync (optional)</h3>
              <p>
                Go to the <strong>Synchronization</strong> tab to enable encrypted bookmark
                synchronization across browser profiles.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <div className="disclaimer-banner">
        <p>
          <strong>Hosting notice:</strong> Capybara can be self-hosted on your personal cloud
          infrastructure or run locally on your machine. There is no centralized SaaS
          offering at this time. Your data stays under your control.
        </p>
      </div>
    </div>
  );
}

function renderLLMConfigTab(props: {
  llmEnabled: boolean;
  setLlmEnabled: (value: boolean) => void;
  llmProvider: LLMProviderType;
  onProviderChange: (provider: LLMProviderType) => void;
  llmEndpoint: string;
  setLlmEndpoint: (value: string) => void;
  llmApiKey: string;
  setLlmApiKey: (value: string) => void;
  llmModel: string;
  setLlmModel: (value: string) => void;
  llmError: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): JSX.Element {
  const isOllama = props.llmProvider === "ollama";
  const isCustom = props.llmProvider === "custom";

  return (
    <div>
      <div className="card">
        <h2>LLM Provider Configuration</h2>
        <p>
          Connect an AI provider to enable automatic bookmark categorization. The extension
          sends bookmark titles, URLs, and tags to the configured provider and receives
          semantic category assignments. Inspired by the
          <strong> provider/model-id</strong> pattern from OpenClaw.
        </p>
      </div>

      <div className="card">
        <h3>Select a provider</h3>
        <p>Choose a cloud API service or a local model runtime.</p>
        <div className="provider-grid">
          {PROVIDER_OPTIONS.map((providerKey) => {
            const label: string = LLM_PROVIDER_LABELS[providerKey];
            const description: string = PROVIDER_DESCRIPTIONS[providerKey];
            const isSelected = props.llmProvider === providerKey;
            return (
              <button
                key={providerKey}
                type="button"
                className={isSelected ? "provider-card selected" : "provider-card"}
                onClick={() => props.onProviderChange(providerKey)}
              >
                <span className="provider-name">{label}</span>
                <span className="provider-type">{description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Provider settings</h3>
        <form onSubmit={props.onSubmit}>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="llm-enabled"
              checked={props.llmEnabled}
              onChange={(event) => props.setLlmEnabled(event.target.checked)}
            />
            <label htmlFor="llm-enabled">Enable AI categorization</label>
          </div>

          {(isOllama || isCustom) && (
            <div className="notice notice-info">
              <p>
                {isOllama
                  ? "Ollama runs locally on your machine. Make sure Ollama is running before enabling categorization. Default endpoint: http://localhost:11434"
                  : "Enter any OpenAI-compatible endpoint URL. This works with LM Studio, vLLM, text-generation-webui, or any custom proxy."}
              </p>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="llm-endpoint">
              Endpoint URL
            </label>
            <input
              id="llm-endpoint"
              className="form-input form-input-mono"
              type="url"
              value={props.llmEndpoint}
              onChange={(event) => props.setLlmEndpoint(event.target.value)}
              placeholder={DEFAULT_ENDPOINTS[props.llmProvider]}
              required={props.llmEnabled}
            />
            <span className="form-hint">
              Default: {DEFAULT_ENDPOINTS[props.llmProvider] || "No default — enter a full URL"}
            </span>
          </div>

          {!isOllama && (
            <div className="form-group">
              <label className="form-label" htmlFor="llm-api-key">
                API Key
              </label>
              <input
                id="llm-api-key"
                className="form-input form-input-mono"
                type="password"
                value={props.llmApiKey}
                onChange={(event) => props.setLlmApiKey(event.target.value)}
                placeholder={props.llmProvider === "anthropic" ? "sk-ant-..." : "sk-..."}
                required={props.llmEnabled}
                autoComplete="off"
              />
              <span className="form-hint">
                Your API key is stored locally in browser extension storage and never shared.
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="llm-model">
              Model
            </label>
            <input
              id="llm-model"
              className="form-input"
              type="text"
              value={props.llmModel}
              onChange={(event) => props.setLlmModel(event.target.value)}
              placeholder={DEFAULT_MODELS[props.llmProvider] || "model-name"}
            />
            <span className="form-hint">
              {DEFAULT_MODELS[props.llmProvider]
                ? `Default: ${DEFAULT_MODELS[props.llmProvider]}`
                : "Enter the model identifier provided by your endpoint"}
            </span>
          </div>

          <div className="form-group">
            <button className="btn btn-primary" type="submit" disabled={props.saveStatus === "saving"}>
              {props.saveStatus === "saving" ? "Saving..." : "Save LLM settings"}
            </button>
          </div>

          {props.saveStatus === "saved" && (
            <p className="status-saved" role="status">Settings saved successfully.</p>
          )}
          {props.saveStatus === "error" && (
            <p className="status-error" role="alert">
              {props.llmError ?? "Unable to save settings. Check the extension console."}
            </p>
          )}
        </form>
      </div>

      <div className="card">
        <h3>Supported providers</h3>
        <p>
          Capybara supports any provider compatible with the OpenAI chat completions API
          or the Anthropic messages API:
        </p>
        <ul>
          <li><strong>OpenAI</strong> — GPT-4o, GPT-4o-mini, and other chat models</li>
          <li><strong>Anthropic</strong> — Claude Sonnet, Claude Haiku, Claude Opus</li>
          <li><strong>Google Gemini</strong> — Gemini 2.0 Flash and Pro models</li>
          <li><strong>Ollama</strong> — Any locally-running model (Llama, Mistral, Phi, etc.)</li>
          <li><strong>Custom</strong> — LM Studio, vLLM, text-generation-webui, or any OpenAI-compatible proxy</li>
        </ul>
        <p>
          Configuration is stored in browser extension storage under the
          key <code>{LLM_CONFIGURATION_STORAGE_KEY}</code>.
        </p>
      </div>
    </div>
  );
}

function renderSyncTab(props: {
  syncEnabled: boolean;
  setSyncEnabled: (value: boolean) => void;
  syncSecret: string;
  setSyncSecret: (value: string) => void;
  syncSaveStatus: "idle" | "saving" | "saved" | "error";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): JSX.Element {
  return (
    <div>
      <div className="card">
        <h2>Multi-Device Synchronization</h2>
        <p>
          Synchronization is optional and disabled by default. When enabled, the extension
          keeps your merged bookmark index in <code>browser.storage.sync</code>, which is
          synced through your browser account. The payload is compressed and encrypted
          before it leaves this device.
        </p>
      </div>

      <div className="card">
        <form onSubmit={props.onSubmit}>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="sync-enabled"
              checked={props.syncEnabled}
              onChange={(event) => props.setSyncEnabled(event.target.checked)}
            />
            <label htmlFor="sync-enabled">Enable multi-device synchronization</label>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sync-passphrase">
              Sync passphrase (optional)
            </label>
            <input
              id="sync-passphrase"
              className="form-input"
              type="password"
              value={props.syncSecret}
              onChange={(event) => props.setSyncSecret(event.target.value)}
              placeholder="Enter a passphrase to share across devices"
              autoComplete="new-password"
              disabled={!props.syncEnabled}
            />
            <span className="form-hint">
              With a passphrase, the encryption key is derived from it so other devices
              with the same secret can decrypt snapshots. Without one, device-specific
              platform entropy keeps data local to this profile.
            </span>
          </div>

          <div className="form-group">
            <button className="btn btn-primary" type="submit" disabled={props.syncSaveStatus === "saving"}>
              {props.syncSaveStatus === "saving" ? "Saving..." : "Save synchronization settings"}
            </button>
          </div>

          {props.syncSaveStatus === "saved" && (
            <p className="status-saved" role="status">Synchronization settings saved.</p>
          )}
          {props.syncSaveStatus === "error" && (
            <p className="status-error" role="alert">
              Unable to save synchronization settings. Check the extension console.
            </p>
          )}
        </form>
      </div>

      <div className="card">
        <p>
          Settings are stored using the browser extension storage under the
          key <code>{SYNC_SETTINGS_STORAGE_KEY}</code>. Disable this option if you prefer
          your bookmarks to stay on this device only.
        </p>
      </div>
    </div>
  );
}

function renderAboutTab(): JSX.Element {
  return (
    <div>
      <div className="card">
        <h2>About Capybara</h2>
        <p>
          Capybara is a privacy-first, cross-browser WebExtension (Manifest V3) that
          unifies bookmarks from multiple browsers into a single, searchable library.
          No data leaves the client unless you explicitly enable optional LLM-based
          categorization.
        </p>
      </div>

      <div className="disclaimer-banner">
        <p>
          <strong>Hosting notice:</strong> Capybara can be self-hosted on your personal
          cloud infrastructure (e.g. a private VPS, home server, or cloud VM) or run
          entirely locally on your machine. There is no centralized SaaS offering at
          this time. You own and control all your data.
        </p>
      </div>

      <div className="card">
        <h3>Architecture</h3>
        <p>
          The data pipeline follows a clear flow: <strong>Fetch</strong> (browser APIs)
          → <strong>Merge</strong> (deduplicate) → <strong>Categorize</strong> (tag)
          → <strong>Index</strong> (search) → <strong>Render</strong> (UI).
        </p>
      </div>

      <div className="card">
        <h3>Privacy</h3>
        <ul>
          <li>All bookmark data is stored locally in browser extension storage</li>
          <li>Synchronization encrypts data before it leaves the device</li>
          <li>LLM categorization only sends minimal metadata (titles, URLs, tags)</li>
          <li>No analytics, tracking, or telemetry of any kind</li>
        </ul>
      </div>

      <div className="card">
        <h3>Links</h3>
        <ul>
          <li>
            <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noreferrer">
              OpenClaw — LLM provider configuration reference
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

const TAB_LABELS: Record<TabId, string> = {
  quickstart: "Quick Start",
  llm: "LLM Configuration",
  sync: "Synchronization",
  about: "About"
};

const TAB_ORDER: TabId[] = ["quickstart", "llm", "sync", "about"];

export function Settings(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>("quickstart");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncSecret, setSyncSecret] = useState("");
  const [syncSaveStatus, setSyncSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState<LLMProviderType>("openai");
  const [llmEndpoint, setLlmEndpoint] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const syncSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const llmSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (syncSaveTimeoutRef.current) {
        clearTimeout(syncSaveTimeoutRef.current);
        syncSaveTimeoutRef.current = null;
      }

      if (llmSaveTimeoutRef.current) {
        clearTimeout(llmSaveTimeoutRef.current);
        llmSaveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateConfiguration(): Promise<void> {
      try {
        const [configuration, syncSettings] = await Promise.all([
          loadLLMConfiguration(),
          loadSyncSettings()
        ]);

        if (!active) {
          return;
        }

        applyLLMConfiguration(
          configuration ?? {
            enabled: false,
            provider: "openai" as LLMProviderType,
            endpoint: DEFAULT_ENDPOINTS.openai,
            apiKey: "",
            model: DEFAULT_MODELS.openai
          }
        );
        applySyncSettings(syncSettings);
      } catch (error) {
        console.error("Failed to hydrate settings", error);
      }
    }

    function applyLLMConfiguration(configuration: LLMConfiguration): void {
      setLlmEnabled(configuration.enabled);
      setLlmProvider(configuration.provider ?? "openai");
      setLlmEndpoint(configuration.endpoint ?? "");
      setLlmApiKey(configuration.apiKey ?? "");
      setLlmModel(configuration.model ?? "");
    }

    function applySyncSettings(
      settings: Awaited<ReturnType<typeof loadSyncSettings>>
    ): void {
      setSyncEnabled(settings.enabled);
      setSyncSecret(settings.secret ?? "");
    }

    void hydrateConfiguration();

    return () => {
      active = false;
    };
  }, []);

  function handleProviderChange(newProvider: LLMProviderType): void {
    setLlmProvider(newProvider);
    setLlmEndpoint(DEFAULT_ENDPOINTS[newProvider]);
    setLlmModel(DEFAULT_MODELS[newProvider]);
    setLlmError(null);
  }

  async function handleSyncSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSyncSaveStatus("saving");

    try {
      const trimmedSecret = syncSecret.trim();
      await saveSyncSettings({
        enabled: syncEnabled,
        keySource: trimmedSecret.length > 0 ? "user" : "platform",
        secret: trimmedSecret.length > 0 ? trimmedSecret : undefined
      });

      requestImmediateSynchronization();

      setSyncSaveStatus("saved");
      if (syncSaveTimeoutRef.current) {
        clearTimeout(syncSaveTimeoutRef.current);
      }

      syncSaveTimeoutRef.current = setTimeout(() => {
        syncSaveTimeoutRef.current = null;
        setSyncSaveStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Failed to persist synchronization settings", error);
      setSyncSaveStatus("error");
    }
  }

  async function handleLLMSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveStatus("saving");
    setLlmError(null);

    try {
      const trimmedEndpoint = llmEndpoint.trim();
      const trimmedApiKey = llmApiKey.trim();
      const trimmedModel = llmModel.trim();
      let endpointToPersist = trimmedEndpoint;

      if (llmEnabled && trimmedEndpoint.length > 0) {
        const permissionInfo = getHostPermissionInfo(trimmedEndpoint);

        if (!permissionInfo) {
          setSaveStatus("error");
          setLlmError(
            llmProvider === "ollama"
              ? "The endpoint must be a valid URL (http://localhost or https://)."
              : "The endpoint must be a valid HTTPS URL without credentials."
          );
          return;
        }

        const granted = await ensureHostPermission(permissionInfo.pattern);
        if (!granted) {
          setSaveStatus("error");
          setLlmError(
            `Permission to contact ${permissionInfo.origin} was denied. Allow access and try again.`
          );
          return;
        }

        endpointToPersist = permissionInfo.href;
      }

      await saveLLMConfiguration({
        enabled: llmEnabled,
        provider: llmProvider,
        endpoint: endpointToPersist,
        apiKey: trimmedApiKey,
        model: trimmedModel.length > 0 ? trimmedModel : DEFAULT_MODELS[llmProvider]
      });

      setSaveStatus("saved");
      if (llmSaveTimeoutRef.current) {
        clearTimeout(llmSaveTimeoutRef.current);
      }

      llmSaveTimeoutRef.current = setTimeout(() => {
        llmSaveTimeoutRef.current = null;
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Failed to persist LLM configuration", error);
      setLlmError((previous) =>
        previous ?? "Unable to save settings. Please check the extension console."
      );
      setSaveStatus("error");
    }
  }

  return (
    <div className="options-layout">
      <header className="options-topbar">
        <h1>Capybara</h1>
        <small>Unified bookmark manager</small>
      </header>

      <div className="options-tabs" role="tablist" aria-label="Settings sections">
        {TAB_ORDER.map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            className={activeTab === tabId ? "tab-button active" : "tab-button"}
            aria-selected={activeTab === tabId}
            aria-controls={`panel-${tabId}`}
            onClick={() => setActiveTab(tabId)}
          >
            {TAB_LABELS[tabId]}
          </button>
        ))}
      </div>

      <div className="options-content" role="tabpanel" id={`panel-${activeTab}`}>
        {activeTab === "quickstart" && renderQuickStartTab()}

        {activeTab === "llm" && renderLLMConfigTab({
          llmEnabled,
          setLlmEnabled,
          llmProvider,
          onProviderChange: handleProviderChange,
          llmEndpoint,
          setLlmEndpoint,
          llmApiKey,
          setLlmApiKey,
          llmModel,
          setLlmModel,
          llmError,
          saveStatus,
          onSubmit: (e) => void handleLLMSubmit(e)
        })}

        {activeTab === "sync" && renderSyncTab({
          syncEnabled,
          setSyncEnabled,
          syncSecret,
          setSyncSecret,
          syncSaveStatus,
          onSubmit: (e) => void handleSyncSubmit(e)
        })}

        {activeTab === "about" && renderAboutTab()}
      </div>

      <footer className="options-footer">
        <p>
          Capybara v0.0.1 — Privacy-first bookmark management.
          Self-host on your cloud or run locally. No centralized SaaS.
        </p>
      </footer>
    </div>
  );
}
