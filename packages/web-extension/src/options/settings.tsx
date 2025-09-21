import { FormEvent, useEffect, useState } from "react";
import { LLM_CONFIGURATION_STORAGE_KEY, type LLMConfiguration } from "../domain/models/llm-configuration";
import { loadLLMConfiguration, saveLLMConfiguration } from "../domain/services/llm-settings";

export function Settings(): JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmEndpoint, setLlmEndpoint] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let active = true;

    async function hydrateConfiguration(): Promise<void> {
      const configuration = await loadLLMConfiguration();
      if (!active) {
        return;
      }

      if (configuration) {
        applyConfiguration(configuration);
      } else {
        applyConfiguration({
          enabled: false,
          endpoint: "",
          apiKey: ""
        });
      }
    }

    function applyConfiguration(configuration: LLMConfiguration): void {
      setLlmEnabled(configuration.enabled);
      setLlmEndpoint(configuration.endpoint ?? "");
      setLlmApiKey(configuration.apiKey ?? "");
      setLlmModel(configuration.model ?? "");
    }

    void hydrateConfiguration();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveStatus("saving");

    try {
      const trimmedModel = llmModel.trim();
      await saveLLMConfiguration({
        enabled: llmEnabled,
        endpoint: llmEndpoint.trim(),
        apiKey: llmApiKey.trim(),
        model: trimmedModel.length > 0 ? trimmedModel : undefined
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to persist LLM configuration", error);
      setSaveStatus("error");
    }
  }

  return (
    <section>
      <h2>Synchronization</h2>
      <label>
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={(event) => setSyncEnabled(event.target.checked)}
        />
        Enable automatic bookmark synchronization
      </label>

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
            <p role="alert">Unable to save settings. Please check the extension console.</p>
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
