import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveModelBrand, resolveProviderBrand } from "../lib/brands/model-mark";

test("resolveModelBrand maps popular model names and providers", () => {
  assert.equal(resolveModelBrand({ label: "Claude Opus 5", provider: "Anthropic" })?.id, "claude");
  assert.equal(resolveModelBrand({ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" })?.id, "openai");
  assert.equal(resolveModelBrand({ id: "glm-5.2", label: "GLM 5.2", provider: "Z.ai" })?.id, "zai");
  assert.equal(resolveModelBrand({ label: "Grok 4" })?.id, "xai");
  assert.equal(resolveModelBrand({ label: "Qwen 3" })?.id, "qwen");
  assert.equal(resolveModelBrand({ label: "Kimi K2" })?.id, "kimi");
  assert.equal(resolveModelBrand({ label: "Gemini 2.5 Pro" })?.id, "gemini");
  assert.equal(resolveModelBrand({ label: "Cursor Composer" })?.id, "cursor");
  assert.equal(resolveModelBrand({ label: "DeepSeek V3" })?.id, "deepseek");
  assert.equal(resolveModelBrand({ label: "unknown-local-model" }), null);
});

test("resolveProviderBrand maps coding-session providers", () => {
  assert.equal(resolveProviderBrand("claude-code")?.id, "claude");
  assert.equal(resolveProviderBrand("codex")?.id, "openai");
  assert.equal(resolveProviderBrand("cursor")?.id, "cursor");
  assert.equal(resolveProviderBrand("gemini-antigravity")?.id, "gemini");
  assert.equal(resolveProviderBrand("git")?.id, "git");
});

test("brand mark files exist for every resolved logo", async () => {
  const brands = await readdir(path.join(process.cwd(), "public", "assets", "brands"));
  const svgs = new Set(brands.filter((name) => name.endsWith(".svg")));
  const samples = [
    resolveModelBrand({ label: "Claude Opus 5" }),
    resolveModelBrand({ label: "GPT-5.6 Luna" }),
    resolveModelBrand({ label: "Grok" }),
    resolveModelBrand({ label: "Qwen" }),
    resolveModelBrand({ label: "Kimi" }),
    resolveModelBrand({ label: "GLM 5.2" }),
    resolveProviderBrand("cursor"),
  ];
  for (const brand of samples) {
    assert.ok(brand, "expected a brand");
    const filename = brand!.src.replace("/assets/brands/", "");
    assert.ok(svgs.has(filename), `missing ${filename}`);
  }
});
