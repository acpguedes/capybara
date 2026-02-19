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

export function Settings(): JSX.Element {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
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

  const isOllama = llmProvider === "ollama";

  return (
    <section>
      <section aria-labelledby="sync-settings-heading">
        <h2 id="sync-settings-heading">Synchronization</h2>
        <p>
          Multi-device synchronization is optional and disabled by default. When enabled, the
          extension keeps your merged bookmark index in <code>browser.storage.sync</code>, which is
          synced through your browser account. The payload is compressed and encrypted before it
          leaves this device.
        </p>
        <form onSubmit={(e) => void handleSyncSubmit(e)}>
          <label>
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(event) => setSyncEnabled(event.target.checked)}
            />
            Enable multi-device synchronization
          </label>

          <label>
            Sync passphrase (optional)
            <input
              type="password"
              value={syncSecret}
              onChange={(event) => setSyncSecret(event.target.value)}
              placeholder="Enter a passphrase to share across devices"
              autoComplete="new-password"
              disabled={!syncEnabled}
            />
          </label>
          <p>
            If you provide a passphrase the encryption key is derived from it, allowing other
            devices with the same secret to decrypt snapshots. Without a passphrase the extension
            uses device-specific platform entropy, keeping the data local to the current browser
            profile.
          </p>

          <button type="submit" disabled={syncSaveStatus === "saving"}>
            {syncSaveStatus === "saving" ? "Saving..." : "Save synchronization settings"}
          </button>

          {syncSaveStatus === "saved" && <p role="status">Synchronization settings saved.</p>}
          {syncSaveStatus === "error" && (
            <p role="alert">Unable to save synchronization settings. Check the extension console.</p>
          )}
        </form>
        <p>
          Settings are stored using the browser&apos;s extension storage under the key
          <code>{SYNC_SETTINGS_STORAGE_KEY}</code>. Disable this option if you prefer your bookmarks
          to stay on this device only.
        </p>
      </section>

      <section aria-labelledby="llm-settings-heading">
        <h2 id="llm-settings-heading">LLM Categorization</h2>
        <p>
          Configure an LLM provider for AI-assisted bookmark categorization. The extension sends
          bookmark titles, URLs, and tags to the configured provider and receives semantic category
          assignments. Categories are created dynamically and evolve as your library grows.
        </p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            <input
              type="checkbox"
              checked={llmEnabled}
              onChange={(event) => setLlmEnabled(event.target.checked)}
            />
            Enable AI categorization
          </label>

          <label>
            Provider
            <select
              value={llmProvider}
              onChange={(event) =>
                handleProviderChange(event.target.value as LLMProviderType)
              }
            >
              {PROVIDER_OPTIONS.map((providerKey) => {
                const label: string = LLM_PROVIDER_LABELS[providerKey];
                return (
                  <option key={providerKey} value={providerKey}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label>
            Endpoint
            <input
              type="url"
              value={llmEndpoint}
              onChange={(event) => setLlmEndpoint(event.target.value)}
              placeholder={DEFAULT_ENDPOINTS[llmProvider]}
              required={llmEnabled}
            />
          </label>

          {!isOllama && (
            <label>
              API Key
              <input
                type="password"
                value={llmApiKey}
                onChange={(event) => setLlmApiKey(event.target.value)}
                placeholder={llmProvider === "anthropic" ? "sk-ant-..." : "sk-..."}
                required={llmEnabled}
                autoComplete="off"
              />
            </label>
          )}

          <label>
            Model
            <input
              type="text"
              value={llmModel}
              onChange={(event) => setLlmModel(event.target.value)}
              placeholder={DEFAULT_MODELS[llmProvider]}
            />
          </label>

          <button type="submit" disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving..." : "Save LLM Settings"}
          </button>

          {saveStatus === "saved" && <p role="status">LLM settings saved.</p>}
          {saveStatus === "error" && (
            <p role="alert">
              {llmError ?? "Unable to save settings. Please check the extension console."}
            </p>
          )}
        </form>
        <p>
          Settings are stored using the browser&apos;s extension storage under the key
          <code>{LLM_CONFIGURATION_STORAGE_KEY}</code> and read by the background worker during
          synchronization. Supported providers: OpenAI, Anthropic (Claude), Google Gemini,
          Ollama (local), or any OpenAI-compatible custom endpoint.
        </p>
      </section>
    </section>
  );
}
