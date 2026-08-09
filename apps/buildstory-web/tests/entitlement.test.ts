import assert from "node:assert/strict";
import test from "node:test";
import { cloudNarrativeAvailable, effectivePlan } from "../lib/narrative/entitlement";
import { isSupportedNarrativeModel } from "../lib/narrative/pricing";

test("effectivePlan returns the account's real plan when the launch promotion is off", () => {
  const previous = process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL;
  delete process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL;
  try {
    assert.equal(effectivePlan("free"), "free");
    assert.equal(effectivePlan("pro"), "pro");
  } finally {
    if (previous === undefined) delete process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL;
    else process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL = previous;
  }
});

test("effectivePlan grants pro to every account while BUILDSTORY_LAUNCH_PRO_FOR_ALL is true, without touching the underlying plan value", () => {
  const previous = process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL;
  process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL = "true";
  try {
    assert.equal(effectivePlan("free"), "pro");
    assert.equal(effectivePlan("pro"), "pro");
  } finally {
    if (previous === undefined) delete process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL;
    else process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL = previous;
  }
});

test("isSupportedNarrativeModel recognizes hosted DeepSeek and retained BYOK Luna pricing without guessing", () => {
  assert.equal(isSupportedNarrativeModel("deepseek/deepseek-v4-flash"), true);
  assert.equal(isSupportedNarrativeModel("gpt-5.6-luna"), true);
  assert.equal(isSupportedNarrativeModel("gpt-5.6-terra"), false);
  assert.equal(isSupportedNarrativeModel("gemma4:12b"), false);
});

test("cloudNarrativeAvailable is false when no provider is configured, regardless of entitlement", async () => {
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  delete process.env.BUILDSTORY_OPENROUTER_API_KEY;
  delete process.env.BUILDSTORY_LLM_BASE_URL;
  try {
    assert.equal(await cloudNarrativeAvailable("any-user"), false);
  } finally {
    if (previousKey === undefined) delete process.env.BUILDSTORY_OPENROUTER_API_KEY;
    else process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    if (previousBaseUrl === undefined) delete process.env.BUILDSTORY_LLM_BASE_URL;
    else process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("cloudNarrativeAvailable is true once a provider key is configured", async () => {
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  try {
    assert.equal(await cloudNarrativeAvailable("any-user"), true);
  } finally {
    if (previousKey === undefined) delete process.env.BUILDSTORY_OPENROUTER_API_KEY;
    else process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
  }
});
