export type ModelBrandId =
  | "anthropic"
  | "claude"
  | "openai"
  | "cursor"
  | "xai"
  | "qwen"
  | "kimi"
  | "zai"
  | "deepseek"
  | "mistral"
  | "gemini"
  | "ollama"
  | "perplexity"
  | "huggingface"
  | "meta"
  | "copilot"
  | "minimax"
  | "git";

export type ModelBrand = {
  id: ModelBrandId;
  label: string;
  src: string;
};

const BRANDS: Record<ModelBrandId, ModelBrand> = {
  anthropic: { id: "anthropic", label: "Anthropic", src: "/assets/brands/anthropic.svg" },
  claude: { id: "claude", label: "Claude", src: "/assets/brands/claude.svg" },
  openai: { id: "openai", label: "OpenAI", src: "/assets/brands/openai.svg" },
  cursor: { id: "cursor", label: "Cursor", src: "/assets/brands/cursor.svg" },
  xai: { id: "xai", label: "xAI", src: "/assets/brands/xai.svg" },
  qwen: { id: "qwen", label: "Qwen", src: "/assets/brands/qwen.svg" },
  kimi: { id: "kimi", label: "Kimi", src: "/assets/brands/kimi.svg" },
  zai: { id: "zai", label: "Z.ai", src: "/assets/brands/zai.svg" },
  deepseek: { id: "deepseek", label: "DeepSeek", src: "/assets/brands/deepseek.svg" },
  mistral: { id: "mistral", label: "Mistral", src: "/assets/brands/mistralai.svg" },
  gemini: { id: "gemini", label: "Gemini", src: "/assets/brands/googlegemini.svg" },
  ollama: { id: "ollama", label: "Ollama", src: "/assets/brands/ollama.svg" },
  perplexity: { id: "perplexity", label: "Perplexity", src: "/assets/brands/perplexity.svg" },
  huggingface: { id: "huggingface", label: "Hugging Face", src: "/assets/brands/huggingface.svg" },
  meta: { id: "meta", label: "Meta", src: "/assets/brands/meta.svg" },
  copilot: { id: "copilot", label: "GitHub Copilot", src: "/assets/brands/githubcopilot.svg" },
  minimax: { id: "minimax", label: "MiniMax", src: "/assets/brands/minimax.svg" },
  git: { id: "git", label: "Git", src: "/assets/brands/git.svg" },
};

const PROVIDER_BRANDS: Record<string, ModelBrandId> = {
  anthropic: "claude",
  "claude-code": "claude",
  claude: "claude",
  openai: "openai",
  codex: "openai",
  cursor: "cursor",
  xai: "xai",
  grok: "xai",
  qwen: "qwen",
  moonshot: "kimi",
  kimi: "kimi",
  "z.ai": "zai",
  zai: "zai",
  zhipu: "zai",
  deepseek: "deepseek",
  mistral: "mistral",
  gemini: "gemini",
  "gemini-antigravity": "gemini",
  google: "gemini",
  ollama: "ollama",
  perplexity: "perplexity",
  huggingface: "huggingface",
  meta: "meta",
  copilot: "copilot",
  minimax: "minimax",
  git: "git",
};

const PATTERNS: Array<{ id: ModelBrandId; pattern: RegExp }> = [
  { id: "claude", pattern: /\b(anthropic|claude|sonnet|opus|haiku)\b/i },
  { id: "openai", pattern: /\b(openai|chatgpt|gpt-?\d|o[1-4](?:-mini|-preview)?|codex)\b/i },
  { id: "xai", pattern: /\b(grok|xai|x\.ai)\b/i },
  { id: "kimi", pattern: /\b(kimi|moonshot)\b/i },
  { id: "qwen", pattern: /\b(qwen|dashscope|tongyi)\b/i },
  { id: "zai", pattern: /\b(glm|z\.ai|zhipu|chatglm)\b/i },
  { id: "gemini", pattern: /\b(gemini|antigravity|gemma)\b/i },
  { id: "cursor", pattern: /\b(cursor|composer)\b/i },
  { id: "deepseek", pattern: /\bdeepseek\b/i },
  { id: "mistral", pattern: /\b(mistral|mixtral|codestral)\b/i },
  { id: "meta", pattern: /\b(llama|meta-llama)\b/i },
  { id: "ollama", pattern: /\bollama\b/i },
  { id: "perplexity", pattern: /\b(perplexity|sonar)\b/i },
  { id: "huggingface", pattern: /\b(huggingface|hugging\s*face)\b/i },
  { id: "copilot", pattern: /\b(github\s*)?copilot\b/i },
  { id: "minimax", pattern: /\bminimax\b/i },
];

function haystack(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" ");
}

export function resolveModelBrand(input: {
  id?: string | null;
  label?: string | null;
  provider?: string | null;
}): ModelBrand | null {
  const providerKey = input.provider?.trim().toLocaleLowerCase("en-US") ?? "";
  if (providerKey && PROVIDER_BRANDS[providerKey]) return BRANDS[PROVIDER_BRANDS[providerKey]];
  const text = haystack([input.id, input.label, input.provider]);
  if (!text) return null;
  for (const entry of PATTERNS) {
    if (entry.pattern.test(text)) return BRANDS[entry.id];
  }
  return null;
}

export function resolveProviderBrand(provider: string | null | undefined): ModelBrand | null {
  if (!provider) return null;
  const key = provider.trim().toLocaleLowerCase("en-US");
  const id = PROVIDER_BRANDS[key];
  return id ? BRANDS[id] : resolveModelBrand({ provider });
}

export function modelBrandFallbackLetter(label: string | null | undefined): string {
  const trimmed = label?.trim() ?? "";
  return (trimmed.charAt(0) || "?").toLocaleUpperCase("en-US");
}
