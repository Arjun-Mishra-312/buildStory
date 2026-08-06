import assert from "node:assert/strict";
import test from "node:test";
import { discoverOllamaModels, RECOMMENDED_OLLAMA_MODEL } from "../lib/narrative/ollama";

function tagsResponse(models: unknown[]) {
  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Ollama discovery selects gemma4:12b as the local baseline", async () => {
  const result = await discoverOllamaModels({
    baseUrl: "http://127.0.0.1:11434/v1",
    deviceMemoryGiB: 16,
    hardwareConcurrency: 8,
    fetchImpl: async () => tagsResponse([
      {
        name: "gemma4:12b",
        size: 7_600_000_000,
        details: { parameter_size: "11.9B", quantization_level: "Q4_K_M", family: "gemma4" },
        capabilities: ["completion", "tools"],
      },
      { name: "gemma4:e4b", size: 2_000_000_000, details: { parameter_size: "4B" } },
    ]),
  });

  assert.equal(result.available, true);
  assert.equal(result.recommendedModel, RECOMMENDED_OLLAMA_MODEL);
  assert.equal(result.selectedModel, RECOMMENDED_OLLAMA_MODEL);
  assert.equal(result.installCommand, null);
  assert.equal(result.models[0]?.parameterSize, "11.9B");
});

test("Ollama discovery recommends gemma4:26b only for a larger capable machine", async () => {
  const result = await discoverOllamaModels({
    baseUrl: "http://localhost:11434",
    deviceMemoryGiB: 32,
    hardwareConcurrency: 12,
    fetchImpl: async () => tagsResponse([
      { name: "gemma4:26b", size: 17_000_000_000, details: { parameter_size: "26B" } },
    ]),
  });

  assert.equal(result.recommendedModel, "gemma4:26b");
  assert.equal(result.selectedModel, "gemma4:26b");
});

test("Ollama discovery gives an install command when no local model is present", async () => {
  const result = await discoverOllamaModels({
    baseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => tagsResponse([
      { name: "some-remote-model:latest", remote_model: true, remote_host: "example" },
    ]),
  });

  assert.equal(result.available, true);
  assert.equal(result.selectedModel, null);
  assert.equal(result.recommendedModel, RECOMMENDED_OLLAMA_MODEL);
  assert.equal(result.installCommand, "ollama pull gemma4:12b");
  assert.match(result.reason, /No local model is installed/);
});

test("Ollama discovery does not silently fall back to the undersized e4b model", async () => {
  const result = await discoverOllamaModels({
    baseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => tagsResponse([
      { name: "gemma4:e4b", size: 9_600_000_000, details: { parameter_size: "8B" } },
    ]),
  });

  assert.equal(result.selectedModel, null);
  assert.equal(result.recommendedModel, RECOMMENDED_OLLAMA_MODEL);
  assert.equal(result.installCommand, "ollama pull gemma4:12b");
});
