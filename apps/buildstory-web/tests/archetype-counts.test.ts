import assert from "node:assert/strict";
import test from "node:test";
import { countPublicArchetypes } from "../lib/ingestion/mock-store";

test("mock published stories with a public archetype are counted by facet key", () => {
  const counts = countPublicArchetypes();
  assert.ok(counts.total >= 1);
  assert.ok((counts.byKey["night-owl"] ?? 0) >= 1);
});
