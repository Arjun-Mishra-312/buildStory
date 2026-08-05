import assert from "node:assert/strict";
import test from "node:test";
import { searchPublishedStories } from "../lib/ingestion/mock-store";

test("search: matches published tagline, description, and owner handle case-insensitively", () => {
  const byTagline = searchPublishedStories("research trail");
  assert.ok(byTagline.some((story) => story.slug === "orbit-notes"));

  const byHandle = searchPublishedStories("MINABUILDS");
  assert.ok(byHandle.some((story) => story.slug === "orbit-notes"));

  const noMatch = searchPublishedStories("something that will never appear anywhere");
  assert.equal(noMatch.length, 0);
});

test("search: an empty or whitespace-only query returns no results rather than everything", () => {
  assert.deepEqual(searchPublishedStories(""), []);
  assert.deepEqual(searchPublishedStories("   "), []);
});
