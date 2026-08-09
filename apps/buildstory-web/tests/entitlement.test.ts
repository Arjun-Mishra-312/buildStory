import assert from "node:assert/strict";
import test from "node:test";
import { cloudNarrativeAvailable, effectivePlan } from "../lib/narrative/entitlement";
import { isProOnlyNarrativeModel, isSupportedNarrativeModel } from "../lib/narrative/pricing";

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

test("isProOnlyNarrativeModel gates only the cloud escalation model, never the default or an unrecognized string", () => {
  assert.equal(isProOnlyNarrativeModel("gpt-5.6-terra"), true);
  assert.equal(isProOnlyNarrativeModel("gpt-5.6-luna"), false);
  assert.equal(isProOnlyNarrativeModel("gemma4:12b"), false);
  assert.equal(isProOnlyNarrativeModel("not-a-real-model"), false);
});

test("isSupportedNarrativeModel recognizes exactly the two cloud pricing tiers", () => {
  assert.equal(isSupportedNarrativeModel("gpt-5.6-luna"), true);
  assert.equal(isSupportedNarrativeModel("gpt-5.6-terra"), true);
  assert.equal(isSupportedNarrativeModel("gemma4:12b"), false);
});

test("cloudNarrativeAvailable is false when no provider is configured, regardless of entitlement", () => {
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  delete process.env.BUILDSTORY_LLM_API_KEY;
  delete process.env.BUILDSTORY_LLM_BASE_URL;
  try {
    assert.equal(cloudNarrativeAvailable("any-user"), false);
  } finally {
    if (previousKey === undefined) delete process.env.BUILDSTORY_LLM_API_KEY;
    else process.env.BUILDSTORY_LLM_API_KEY = previousKey;
    if (previousBaseUrl === undefined) delete process.env.BUILDSTORY_LLM_BASE_URL;
    else process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("cloudNarrativeAvailable is true once a provider key is configured", () => {
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  process.env.BUILDSTORY_LLM_API_KEY = "test-key";
  try {
    assert.equal(cloudNarrativeAvailable("any-user"), true);
  } finally {
    if (previousKey === undefined) delete process.env.BUILDSTORY_LLM_API_KEY;
    else process.env.BUILDSTORY_LLM_API_KEY = previousKey;
  }
});
