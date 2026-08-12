import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPEN,
  defaultReportLayoutPrefs,
  isSectionOpen,
  parseReportLayoutPrefs,
  serializeReportLayoutPrefs,
  withSectionHidden,
  withSectionOpen,
  withSectionPinned,
} from "../lib/studio/report-layout-prefs";

test("parseReportLayoutPrefs returns defaults for null, malformed JSON, and unknown version", () => {
  assert.deepEqual(parseReportLayoutPrefs(null), defaultReportLayoutPrefs());
  assert.deepEqual(parseReportLayoutPrefs("{"), defaultReportLayoutPrefs());
  assert.deepEqual(parseReportLayoutPrefs(JSON.stringify({ version: 99, open: { boundary: true } })), defaultReportLayoutPrefs());
});

test("parseReportLayoutPrefs drops unknown section keys and non-boolean open values", () => {
  const raw = JSON.stringify({
    version: 1,
    open: { boundary: true, notASection: true, sessions: "yes" },
    hidden: ["provenance", "notASection"],
    pinned: ["profile"],
  });
  const parsed = parseReportLayoutPrefs(raw);
  assert.deepEqual(parsed.open, { boundary: true });
  assert.deepEqual(parsed.hidden, ["provenance"]);
  assert.deepEqual(parsed.pinned, ["profile"]);
});

test("round-trips through serialize/parse", () => {
  const prefs = withSectionPinned(withSectionHidden(withSectionOpen(defaultReportLayoutPrefs(), "boundary", true), "provenance", true), "profile", true);
  const roundTripped = parseReportLayoutPrefs(serializeReportLayoutPrefs(prefs));
  assert.deepEqual(roundTripped, prefs);
});

test("withSectionOpen stores only deviations from DEFAULT_OPEN", () => {
  const prefs = withSectionOpen(defaultReportLayoutPrefs(), "sessions", DEFAULT_OPEN.sessions);
  assert.deepEqual(prefs.open, {});

  const deviated = withSectionOpen(defaultReportLayoutPrefs(), "sessions", !DEFAULT_OPEN.sessions);
  assert.deepEqual(deviated.open, { sessions: !DEFAULT_OPEN.sessions });
});

test("isSectionOpen falls back to DEFAULT_OPEN when there is no stored deviation", () => {
  const prefs = defaultReportLayoutPrefs();
  assert.equal(isSectionOpen(prefs, "repository"), DEFAULT_OPEN.repository);
  assert.equal(isSectionOpen(prefs, "boundary"), DEFAULT_OPEN.boundary);
});

test("recap payoff sections are visible by default in private reports", () => {
  const prefs = defaultReportLayoutPrefs();
  assert.equal(isSectionOpen(prefs, "narrativeSignals"), true);
  assert.equal(isSectionOpen(prefs, "narrativeInsights"), true);
});

test("hiding a section clears its pin, and pinning a section clears hidden", () => {
  const hidden = withSectionHidden(defaultReportLayoutPrefs(), "provenance", true);
  const pinnedThenHidden = withSectionHidden(withSectionPinned(hidden, "provenance", true), "provenance", true);
  assert.deepEqual(pinnedThenHidden.hidden, ["provenance"]);
  assert.deepEqual(pinnedThenHidden.pinned, []);

  const unhidden = withSectionHidden(pinnedThenHidden, "provenance", false);
  const pinned = withSectionPinned(unhidden, "provenance", true);
  assert.deepEqual(pinned.pinned, ["provenance"]);
  assert.deepEqual(pinned.hidden, []);
});
