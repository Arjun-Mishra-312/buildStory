import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { computeBuilderProfile } from "../lib/ingestion/profile";

test("server profile scoring matches the scanner's shared fixture", async () => {
  const fixture = JSON.parse(
    await readFile(path.resolve(process.cwd(), "../../test-fixtures/profile-scoring.json"), "utf8"),
  ) as {
    inputs: Parameters<typeof computeBuilderProfile>[0];
    expected: {
      scores: Record<string, number>;
      archetype: string;
      workPatterns: Record<string, unknown>;
    };
  };
  const profile = computeBuilderProfile(fixture.inputs);
  assert.deepEqual(
    Object.fromEntries(Object.entries(profile.scores).map(([dimension, score]) => [dimension, score.value])),
    fixture.expected.scores,
  );
  assert.equal(profile.archetype.name, fixture.expected.archetype);
  assert.deepEqual(profile.workPatterns, fixture.expected.workPatterns);
  assert.match(profile.scores.productInstinct.caveat ?? "", /Weak proxy/);
});

test("night-heavy local hours classify as Night Owl instead of short-circuiting on peak hour alone", async () => {
  const fixture = JSON.parse(
    await readFile(path.resolve(process.cwd(), "../../test-fixtures/profile-scoring.json"), "utf8"),
  ) as { inputs: Parameters<typeof computeBuilderProfile>[0] };
  const profile = computeBuilderProfile({
    ...fixture.inputs,
    timeWindow: { utcOffsetMinutes: 0 },
  });
  assert.equal(profile.workPatterns.nightShare, 100);
  assert.equal(profile.archetype.name, "Night Owl");
});
