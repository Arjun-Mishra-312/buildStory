"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { GuideTooltip } from "@/components/guidance/studio-guide";
import { NarrativeModeDisclosure } from "./narrative-mode-disclosure";

type Model = {
  name: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantizationLevel: string | null;
  family: string | null;
  capabilities: string[];
  remote: boolean;
};

type Discovery = {
  available: boolean;
  checkedAt: string;
  models: Model[];
  recommendedModel: string;
  selectedModel: string | null;
  autoSelection: boolean;
  reason: string;
  installCommand: string | null;
  system: {
    deviceMemoryGiB: number | null;
    hardwareConcurrency: number | null;
  };
  errorCode?: string;
};

export const OLLAMA_MODEL_PREFERENCE_KEY = "buildstory:ollama-model";
export const NARRATIVE_MODE_PREFERENCE_KEY = "buildstory:narrative-mode";

function useStoredPreference<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string | null) => value is T,
): [T, (value: T) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener("buildstory-preference-change", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener("buildstory-preference-change", onStoreChange);
    };
  }, []);
  const read = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return isValid(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  }, [fallback, isValid, key]);
  const readServer = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, read, readServer);
  const setValue = useCallback((next: T) => {
    try {
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event("buildstory-preference-change"));
    } catch {
      // Restricted browser storage should not block the settings page.
    }
  }, [key]);
  return [value, setValue];
}

function formatBytes(value: number | null) {
  if (value === null) return "size unavailable";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

/**
 * `discoveryAvailable` mirrors the server's isLocalApiEnabled(). Model discovery
 * asks the SERVER to reach http://127.0.0.1:11434, which only means the
 * creator's machine when the server is that machine. On a hosted Worker the
 * route can only ever 404, so the component skips the request entirely rather
 * than showing an error for a thing that was never going to work. Narrative
 * generation itself is unaffected: buildstory-scan talks to Ollama directly
 * from the creator's machine at scan time.
 */
export function OllamaModelStatus({
  discoveryAvailable = true,
  cloudAvailable = false,
}: {
  discoveryAvailable?: boolean;
  /** Server-derived: only true when a cloud narrative provider is actually configured and the account is entitled. Never guessed client-side, because the failure mode is uploaded excerpts. */
  cloudAvailable?: boolean;
}) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [chosenModel, setChosenModel] = useStoredPreference(OLLAMA_MODEL_PREFERENCE_KEY, "auto", (value): value is string => Boolean(value));
  const [narrativeMode, setNarrativeMode] = useStoredPreference(
    NARRATIVE_MODE_PREFERENCE_KEY,
    "local",
    (value): value is "local" | "byok" | "cloud" | "off" => value === "local" || value === "byok" || value === "cloud" || value === "off",
  );

  useEffect(() => {
    if (!discoveryAvailable) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setError("The local model check timed out. You can continue with Automatic and retry when Ollama is running.");
      controller.abort();
    }, 8_000);
    const navigatorWithHints = navigator as Navigator & { deviceMemory?: number };
    const params = new URLSearchParams();
    if (typeof navigatorWithHints.deviceMemory === "number") {
      params.set("deviceMemoryGiB", String(navigatorWithHints.deviceMemory));
    }
    if (typeof navigator.hardwareConcurrency === "number") {
      params.set("hardwareConcurrency", String(navigator.hardwareConcurrency));
    }

    fetch(`/api/creator/ollama/models?${params.toString()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as Discovery | { error?: { message?: string } } | null;
        if (!response.ok || !body || !("available" in body)) {
          throw new Error((body && "error" in body ? body.error?.message : undefined) ?? "Could not check the local model runtime.");
        }
        setError(null);
        setDiscovery(body);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not check the local model runtime.");
      });

    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [refreshToken, discoveryAvailable]);

  useEffect(() => {
    // The Cloud option is server-gated (see cloudAvailable) because the
    // failure mode of offering it when unconfigured is uploaded excerpts
    // (see the launch audit). If a stale localStorage value from a prior
    // session/deployment still says "cloud" but this deployment cannot
    // honor it, fall back to Local rather than rendering an unselectable
    // option or silently keeping cloud selected.
    if (!cloudAvailable && narrativeMode === "cloud") setNarrativeMode("local");
  }, [cloudAvailable, narrativeMode, setNarrativeMode]);

  const installedModels = discovery?.models.filter((model) => !model.remote) ?? [];
  const systemSummary = discovery
    ? [
        discovery.system.deviceMemoryGiB ? `~${discovery.system.deviceMemoryGiB} GiB browser memory hint` : null,
        discovery.system.hardwareConcurrency ? `${discovery.system.hardwareConcurrency} logical cores` : null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <section className="ollama-model-status" aria-live="polite">
      <header className="ollama-model-status__header">
        <div>
          <span className="section-index">( LOCAL NARRATIVE MODEL )</span>
          <h2>Keep the story model on this machine.</h2>
        </div>
        {discoveryAvailable ? (
          <button className="button button--secondary button--small" type="button" onClick={() => {
            setError(null);
            setDiscovery(null);
            setRefreshToken((value) => value + 1);
          }}>
            Refresh model list
          </button>
        ) : null}
      </header>

      <div className="ollama-model-status__choice" data-guide="create-narrative">
        <label htmlFor="narrative-mode-choice">Narrative generation mode <GuideTooltip label="narrative generation mode">Local keeps excerpts on this machine; bring-your-own-key sends excerpts only to a cloud model you configure yourself; Buildstory Cloud uploads reviewed excerpts through Buildstory; off produces deterministic metrics without narrative prose.</GuideTooltip></label>
        <select
          id="narrative-mode-choice"
          value={narrativeMode}
          onChange={(event) => {
            const value = event.target.value as "local" | "byok" | "cloud" | "off";
            setNarrativeMode(value);
          }}
        >
          <option value="local">Local — excerpts never leave this machine</option>
          <option value="byok">Bring your own key — excerpts go only to your chosen provider</option>
          {cloudAvailable ? <option value="cloud">Buildstory Cloud — reviewed excerpts are uploaded through Buildstory</option> : null}
          <option value="off">Off — deterministic profile only</option>
        </select>
        <small>
          Local is the default.{" "}
          {cloudAvailable
            ? "Bring-your-own-key and Buildstory Cloud are explicit opt-ins."
            : "Bring-your-own-key is an explicit opt-in; Buildstory Cloud is not available on this deployment yet."}
        </small>
        <NarrativeModeDisclosure mode={narrativeMode} />
      </div>

      {!discoveryAvailable ? (
        <p className="ollama-model-status__muted" role="status">
          Model discovery runs only in the local portal — this site cannot reach your machine. Keep <strong>Local</strong> selected and buildstory-scan will detect your installed Ollama models itself when you scan. Leave the model as Automatic unless you want to pin a specific one.
        </p>
      ) : null}
      {discoveryAvailable && !discovery && !error ? <p className="ollama-model-status__muted" role="status">Checking the local model runtime… (up to 8 seconds)</p> : null}
      {error ? <p className="ollama-model-status__error" role="alert">{error}</p> : null}
      {discovery && !discovery.available ? (
        <div className="ollama-model-status__offline">
          <strong>Ollama is not reachable yet.</strong>
          <p>{discovery.reason}</p>
          <code>{discovery.installCommand ?? "ollama pull gemma4:12b"}</code>
        </div>
      ) : null}
      {discovery?.available ? (
        <>
          <div className="ollama-model-status__recommendation">
            <div>
              <span>PORTAL RECOMMENDATION</span>
              <strong>{discovery.recommendedModel}</strong>
            </div>
            <p>{discovery.reason}</p>
            {discovery.installCommand ? <code>{discovery.installCommand}</code> : null}
          </div>
          <div className="ollama-model-status__runtime">
            <div>
              <span>{chosenModel === "auto" ? "SELECTED AUTOMATICALLY" : "MANUAL SELECTION"}</span>
              <strong>{chosenModel === "auto" ? discovery.selectedModel ?? "No usable local model" : chosenModel}</strong>
            </div>
            <div>
              <span>INSTALLED LOCAL MODELS</span>
              <p>{installedModels.length ? installedModels.map((model) => `${model.name} · ${formatBytes(model.sizeBytes)}`).join(" / ") : "None detected"}</p>
            </div>
          </div>
          <div className="ollama-model-status__choice">
            <label htmlFor="ollama-model-choice">Model for the next connection</label>
            <select
              id="ollama-model-choice"
              value={chosenModel}
              onChange={(event) => {
                const value = event.target.value;
                setChosenModel(value);
              }}
            >
              <option value="auto">Automatic — use the portal recommendation</option>
              {installedModels.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
            </select>
            <small>Choose Automatic or an installed model. The choice applies when you create a new connection code.</small>
          </div>
          <small className="ollama-model-status__footnote">
            {chosenModel === "auto" ? "Automatic selection is on." : "A manual model choice will be attached to the next connection."}{systemSummary ? ` ${systemSummary}.` : ""} The browser hint is coarse and never leaves this local portal.
          </small>
        </>
      ) : null}
    </section>
  );
}
