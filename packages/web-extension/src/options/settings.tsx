import { FormEvent, useEffect, useState } from "react";
import {
  LLM_CONFIGURATION_STORAGE_KEY,
  type LLMConfiguration
} from "../domain/models/llm-configuration";
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

export function Settings(): JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncSecret, setSyncSecret] = useState("");
  const [syncSaveStatus, setSyncSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmEndpoint, setLlmEndpoint] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
            endpoint: "",
            apiKey: ""
          }
        );
        applySyncSettings(syncSettings);
      } catch (error) {
        console.error("Failed to hydrate settings", error);
      }
    }

    function applyLLMConfiguration(configuration: LLMConfiguration): void {
      setLlmEnabled(configuration.enabled);
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
      setTimeout(() => setSyncSaveStatus("idle"), 2000);
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
          setLlmError("The endpoint must be a valid HTTPS URL without credentials.");
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
        endpoint: endpointToPersist,
        apiKey: trimmedApiKey,
        model: trimmedModel.length > 0 ? trimmedModel : undefined
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to persist LLM configuration", error);
      setLlmError((previous) =>
        previous ?? "Unable to save settings. Please check the extension console."
      );
      setSaveStatus("error");
    }
  }

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
        <form onSubmit={handleSyncSubmit}>
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
          Configure credentials used by the background worker when requesting AI-assisted bookmark
          categorization.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            <input
              type="checkbox"
              checked={llmEnabled}
              onChange={(event) => setLlmEnabled(event.target.checked)}
            />
            Enable AI categorization
          </label>

          <label>
            Endpoint
            <input
              type="url"
              value={llmEndpoint}
              onChange={(event) => setLlmEndpoint(event.target.value)}
              placeholder="https://api.openai.com/v1/bookmarks"
              required={llmEnabled}
            />
          </label>

          <label>
            API Key
            <input
              type="password"
              value={llmApiKey}
              onChange={(event) => setLlmApiKey(event.target.value)}
              placeholder="sk-..."
              required={llmEnabled}
              autoComplete="off"
            />
          </label>

          <label>
            Model (optional)
            <input
              type="text"
              value={llmModel}
              onChange={(event) => setLlmModel(event.target.value)}
              placeholder="gpt-4o-mini"
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
          synchronization.
        </p>
      </section>
    </section>
  );
}
