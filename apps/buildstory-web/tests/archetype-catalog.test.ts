import assert from "node:assert/strict";
import test from "node:test";
import { canonicalArchetypeName } from "../lib/ingestion/profile";
import { catalogEntry, decoyArchetypes, fanArchetypes, rarityCopy } from "../lib/report/archetype-catalog";

test("Velocity Machine aliases to Shipping Machine in the catalog", () => {
  assert.equal(canonicalArchetypeName("Velocity Machine"), "Shipping Machine");
  assert.equal(catalogEntry("Velocity Machine").name, "Shipping Machine");
  assert.equal(catalogEntry("Night Owl").kicker.length > 0, true);
  assert.match(catalogEntry("Night Owl").signifies, /after ten|dark/i);
  assert.ok(catalogEntry("Architect").signifies.length > 80);
});

test("decoy picks are deterministic for a seed and never include the drawn card", () => {
  const first = decoyArchetypes("Night Owl", "report-abc", 4);
  const second = decoyArchetypes("Night Owl", "report-abc", 4);
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.equal(first.includes("Night Owl"), false);
  const fan = fanArchetypes("Night Owl", "report-abc");
  assert.equal(fan.length, 5);
  assert.equal(fan[2], "Night Owl");
});

test("rarity copy stays qualitative until the public sample is large enough", () => {
  assert.equal(rarityCopy("Night Owl", null), "A rarer rhythm in this catalog");
  assert.equal(rarityCopy("Night Owl", { total: 3, byKey: { "night-owl": 1 } }), "A rarer rhythm in this catalog");
  assert.equal(rarityCopy("Night Owl", { total: 84, byKey: { "night-owl": 12 } }), "12 of 84 published builds");
});
