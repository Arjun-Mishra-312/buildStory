const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const RECOMMENDED_OLLAMA_MODEL = "gemma4:12b";
const LARGER_OLLAMA_MODEL = "gemma4:26b";
const LEGACY_OLLAMA_MODEL = "gemma4:e4b";

export type OllamaModelSummary = {
  name: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantizationLevel: string | null;
  family: string | null;
  capabilities: string[];
  remote: boolean;
};

export type OllamaSystemHints = {
  deviceMemoryGiB: number | null;
  hardwareConcurrency: number | null;
};

export type OllamaDiscovery = {
  available: boolean;
  checkedAt: string;
  models: OllamaModelSummary[];
  recommendedModel: string;
  selectedModel: string | null;
  autoSelection: boolean;
  reason: string;
  installCommand: string | null;
  system: OllamaSystemHints;
  errorCode?: "invalid_config" | "not_running" | "request_failed";
};

export type OllamaDiscoveryOptions = {
  baseUrl?: string;
  deviceMemoryGiB?: number | null;
  hardwareConcurrency?: number | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase("en-US");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function parseOllamaUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !isLoopbackHostname(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !["", "/", "/v1", "/v1/"].includes(parsed.pathname)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function configuredOllamaUrl() {
  const explicit = process.env.BUILDSTORY_OLLAMA_BASE_URL?.trim();
  if (explicit) return explicit;

  const llmBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL?.trim();
  if (llmBaseUrl && parseOllamaUrl(llmBaseUrl)) return llmBaseUrl;
  return DEFAULT_OLLAMA_BASE_URL;
}

function nativeBaseUrl(raw: string) {
  const parsed = parseOllamaUrl(raw);
  if (!parsed) return null;
  return parsed.origin;
}

export function isOllamaBaseUrl(value: string | undefined) {
  return Boolean(value && parseOllamaUrl(value));
}

export function isOllamaAutoModel(value: string | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return !normalized || normalized === "auto" || normalized === "ollama-auto";
}

export function isValidOllamaModelName(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,119}$/.test(value.trim());
}

function normalizedSystemHints(options: OllamaDiscoveryOptions): OllamaSystemHints {
  const deviceMemoryGiB = options.deviceMemoryGiB;
  const hardwareConcurrency = options.hardwareConcurrency;
  return {
    deviceMemoryGiB:
      typeof deviceMemoryGiB === "number" && Number.isFinite(deviceMemoryGiB) && deviceMemoryGiB > 0
        ? Math.min(Math.max(Math.round(deviceMemoryGiB * 4) / 4, 0.25), 512)
        : null,
    hardwareConcurrency:
      typeof hardwareConcurrency === "number" && Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0
        ? Math.min(Math.max(Math.trunc(hardwareConcurrency), 1), 512)
        : null,
  };
}

function canUseLargerModel(system: OllamaSystemHints) {
  return (
    system.deviceMemoryGiB !== null &&
    system.deviceMemoryGiB >= 24 &&
    (system.hardwareConcurrency === null || system.hardwareConcurrency >= 8)
  );
}

function stringOrNull(value: unknown, maxLength = 80) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function modelSummary(value: unknown): OllamaModelSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = stringOrNull(row.name, 120);
  if (!name) return null;
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details)
    ? row.details as Record<string, unknown>
    : null;
  const sizeBytes = typeof row.size === "number" && Number.isFinite(row.size) && row.size >= 0
    ? Math.min(Math.trunc(row.size), Number.MAX_SAFE_INTEGER)
    : null;
  const capabilities = Array.isArray(row.capabilities)
    ? row.capabilities.filter((item): item is string => typeof item === "string").slice(0, 12).map((item) => item.slice(0, 48))
    : [];
  return {
    name,
    sizeBytes,
    parameterSize: stringOrNull(details?.parameter_size, 32),
    quantizationLevel: stringOrNull(details?.quantization_level, 32),
    family: stringOrNull(details?.family, 32),
    capabilities,
    remote: row.remote_model === true || typeof row.remote_host === "string",
  };
}

function selectionFor(models: OllamaModelSummary[], system: OllamaSystemHints) {
  const localNames = new Set(models.filter((model) => !model.remote).map((model) => model.name));
  const largerIsReasonable = canUseLargerModel(system);
  const recommendedModel = largerIsReasonable && localNames.has(LARGER_OLLAMA_MODEL)
    ? LARGER_OLLAMA_MODEL
    : RECOMMENDED_OLLAMA_MODEL;
  const selectedModel = localNames.has(recommendedModel)
    ? recommendedModel
    : localNames.has(RECOMMENDED_OLLAMA_MODEL)
      ? RECOMMENDED_OLLAMA_MODEL
    : localNames.has(LARGER_OLLAMA_MODEL)
      ? LARGER_OLLAMA_MODEL
      : models.find((model) => !model.remote && model.name !== LEGACY_OLLAMA_MODEL)?.name ?? null;

  let reason: string;
  if (!models.some((model) => !model.remote)) {
    reason = `No local model is installed. ${RECOMMENDED_OLLAMA_MODEL} is the recommended baseline for this portal.`;
  } else if (selectedModel === recommendedModel) {
    reason = `${selectedModel} is installed and selected automatically for local narrative generation.`;
  } else if (localNames.has(RECOMMENDED_OLLAMA_MODEL)) {
    reason = `${RECOMMENDED_OLLAMA_MODEL} is installed and remains the recommended local baseline.`;
  } else if (selectedModel) {
    reason = `${RECOMMENDED_OLLAMA_MODEL} is recommended; the installed ${selectedModel} model is being used until it is available.`;
  } else {
    reason = `${RECOMMENDED_OLLAMA_MODEL} is recommended, but no supported baseline model is installed yet.`;
  }

  return {
    recommendedModel,
    selectedModel,
    reason,
    installCommand: localNames.has(recommendedModel) ? null : `ollama pull ${recommendedModel}`,
  };
}

function baseResult(options: OllamaDiscoveryOptions): OllamaDiscovery {
  const system = normalizedSystemHints(options);
  return {
    available: false,
    checkedAt: new Date().toISOString(),
    models: [],
    recommendedModel: RECOMMENDED_OLLAMA_MODEL,
    selectedModel: null,
    autoSelection: isOllamaAutoModel(process.env.BUILDSTORY_LLM_MODEL),
    reason: "Ollama is not reachable.",
    installCommand: `ollama pull ${RECOMMENDED_OLLAMA_MODEL}`,
    system,
  };
}

export async function discoverOllamaModels(options: OllamaDiscoveryOptions = {}): Promise<OllamaDiscovery> {
  const result = baseResult(options);
  const baseUrl = nativeBaseUrl(options.baseUrl ?? configuredOllamaUrl());
  if (!baseUrl) {
    return { ...result, errorCode: "invalid_config", reason: "Ollama must use a credential-free localhost URL." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 5_000, 1_000), 15_000));
  try {
    const response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/tags`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ...result, errorCode: "request_failed", reason: `Ollama returned HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as { models?: unknown };
    const models = Array.isArray(payload.models)
      ? payload.models.map(modelSummary).filter((model): model is OllamaModelSummary => Boolean(model)).slice(0, 100)
      : [];
    const selection = selectionFor(models, result.system);
    return {
      ...result,
      available: true,
      models,
      ...selection,
      errorCode: undefined,
    };
  } catch {
    return { ...result, errorCode: "not_running", reason: "Ollama is not running or did not respond in time." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveOllamaModel() {
  const discovery = await discoverOllamaModels();
  if (!discovery.available) {
    throw new Error(discovery.reason);
  }
  if (!discovery.selectedModel) {
    throw new Error(`Install the recommended local model with: ${discovery.installCommand ?? `ollama pull ${RECOMMENDED_OLLAMA_MODEL}`}`);
  }
  return discovery.selectedModel;
}
