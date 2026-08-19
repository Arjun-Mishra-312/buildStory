import assert from "node:assert/strict";
import test from "node:test";
import { computeStreaks, foldChaptersToDailyRows, foldUnionToDailyRows, hourlyFromSessions, periodStartDay, unionUnpublishedOntoPublished, usageWindowRelation } from "../lib/usage/fold";

function scannerChapter(args: {
  chapterIndex: number;
  start: string;
  end: string;
  sessions: Array<{
    sessionRef: string;
    startedAt: string;
    endedAt?: string;
    modelRefs?: string[];
    totalTokens?: number | null;
  }>;
  models?: Array<{ name: string; totalTokens: number; costMicroUsd: number | null }>;
}) {
  return {
    chapterIndex: args.chapterIndex,
    snapshot: {
      timeWindow: { start: args.start, end: args.end },
      sessions: args.sessions.map((session) => ({
        sessionRef: session.sessionRef,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? session.startedAt,
        modelRefs: session.modelRefs ?? ["alpha"],
        tokenUsage: session.totalTokens == null ? null : { totalTokens: session.totalTokens },
      })),
      usage: {
        models: (args.models ?? [{ name: "alpha", totalTokens: 100, costMicroUsd: 1_000_000 }]).map((model) => ({
          provider: "openai",
          name: model.name,
          turnCount: 1,
          sessionCount: 1,
          tokenUsage: { totalTokens: model.totalTokens },
          costMicroUsd: model.costMicroUsd,
        })),
      },
    },
  };
}

test("usage fold: cumulative re-scan replaces sessions instead of summing them", () => {
  const rows = foldChaptersToDailyRows([
    scannerChapter({
      chapterIndex: 1,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-10T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_a", startedAt: "2026-01-02T12:00:00.000Z", totalTokens: 100 }],
      models: [{ name: "alpha", totalTokens: 100, costMicroUsd: 1_000_000 }],
    }),
    scannerChapter({
      chapterIndex: 2,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-02-01T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_a", startedAt: "2026-01-02T12:00:00.000Z", totalTokens: 250 }],
      models: [{ name: "alpha", totalTokens: 250, costMicroUsd: 2_000_000 }],
    }),
  ]);
  const tokens = rows.filter((row) => row.modelKey !== "__activity").reduce((sum, row) => sum + row.tokens, 0);
  assert.equal(tokens, 250);
  assert.equal(usageWindowRelation(
    { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-10T00:00:00.000Z" },
    { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-02-01T00:00:00.000Z" },
  ), "cumulative");
});

test("usage fold: incremental chapters union distinct session refs", () => {
  const rows = foldChaptersToDailyRows([
    scannerChapter({
      chapterIndex: 1,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-10T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_a", startedAt: "2026-01-02T12:00:00.000Z", totalTokens: 100 }],
    }),
    scannerChapter({
      chapterIndex: 2,
      start: "2026-01-11T00:00:00.000Z",
      end: "2026-01-20T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_b", startedAt: "2026-01-12T12:00:00.000Z", totalTokens: 40 }],
      models: [{ name: "alpha", totalTokens: 40, costMicroUsd: 400_000 }],
    }),
  ]);
  const tokens = rows.filter((row) => row.modelKey !== "__activity").reduce((sum, row) => sum + row.tokens, 0);
  const sessions = rows.filter((row) => row.modelKey === "__activity").reduce((sum, row) => sum + row.sessionCount, 0);
  assert.equal(tokens, 140);
  assert.equal(sessions, 2);
});

test("usage fold: overlapping chapters keep one copy of each sessionRef", () => {
  const rows = foldChaptersToDailyRows([
    scannerChapter({
      chapterIndex: 1,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-20T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_a", startedAt: "2026-01-05T12:00:00.000Z", totalTokens: 100 }],
    }),
    scannerChapter({
      chapterIndex: 2,
      start: "2026-01-10T00:00:00.000Z",
      end: "2026-01-25T00:00:00.000Z",
      sessions: [{ sessionRef: "ses_a", startedAt: "2026-01-05T12:00:00.000Z", totalTokens: 100 }],
    }),
  ]);
  const tokens = rows.filter((row) => row.modelKey !== "__activity").reduce((sum, row) => sum + row.tokens, 0);
  assert.equal(tokens, 100);
  assert.equal(usageWindowRelation(
    { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-20T00:00:00.000Z" },
    { startedAt: "2026-01-10T00:00:00.000Z", endedAt: "2026-01-25T00:00:00.000Z" },
  ), "overlapping");
});

test("usage fold: report-shaped snapshots distribute model totals across sessions", () => {
  const rows = foldChaptersToDailyRows([
    {
      chapterIndex: 1,
      snapshot: {
        timeWindow: { startedAt: "2026-07-01T00:00:00.000Z", endedAt: "2026-07-10T00:00:00.000Z" },
        sessions: [
          { id: "ses_01", startedAt: "2026-07-02T12:00:00.000Z", endedAt: "2026-07-02T13:00:00.000Z", modelIds: ["gpt"] },
          { id: "ses_02", startedAt: "2026-07-03T12:00:00.000Z", endedAt: "2026-07-03T13:00:00.000Z", modelIds: ["gpt"] },
        ],
        usage: {
          models: [{ id: "gpt", label: "GPT", provider: "OpenAI", tokenUsage: { totalTokens: 100 }, costMicroUsd: 2_000_000 }],
        },
      },
    },
  ]);
  const tokens = rows.filter((row) => row.modelKey !== "__activity").reduce((sum, row) => sum + row.tokens, 0);
  const spend = rows.filter((row) => row.modelKey !== "__activity").reduce((sum, row) => sum + (row.costMicroUsd ?? 0), 0);
  assert.equal(tokens, 100);
  assert.equal(spend, 2_000_000);
});

test("usage fold: a session touching multiple models splits tokens by each model's chapter-wide share, not evenly", () => {
  // Opus is 10x pricier per token than sonnet and is referenced in nine
  // mixed sessions, but only makes up 200/2000 = 10% of the chapter's real
  // token volume. An even per-model split would hand it 50% of each mixed
  // session's tokens, inflating its cost past sonnet's despite sonnet doing
  // the bulk of the real work (an extra 1000-token solo session).
  const mixedSessions = Array.from({ length: 9 }, (_, index) => ({
    sessionRef: `ses_mixed_${index}`,
    startedAt: `2026-01-0${(index % 9) + 1}T12:00:00.000Z`,
    modelRefs: ["opus", "sonnet"],
    totalTokens: 100,
  }));
  const rows = foldChaptersToDailyRows([
    scannerChapter({
      chapterIndex: 1,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-10T00:00:00.000Z",
      sessions: [
        ...mixedSessions,
        { sessionRef: "ses_solo", startedAt: "2026-01-09T12:00:00.000Z", modelRefs: ["sonnet"], totalTokens: 1000 },
      ],
      models: [
        { name: "opus", totalTokens: 200, costMicroUsd: 2_000_000 },
        { name: "sonnet", totalTokens: 1800, costMicroUsd: 1_800_000 },
      ],
    }),
  ]);
  const spendByModel = new Map<string, number>();
  for (const row of rows) {
    if (row.modelKey === "__activity") continue;
    spendByModel.set(row.modelKey, (spendByModel.get(row.modelKey) ?? 0) + (row.costMicroUsd ?? 0));
  }
  assert.equal(spendByModel.get("openai:opus"), 900_000);
  assert.equal(spendByModel.get("openai:sonnet"), 1_810_000);
  assert.equal(spendByModel.get("openai:sonnet")! > spendByModel.get("openai:opus")!, true);
});

test("periodStartDay: 7d includes today and six prior UTC days", () => {
  const now = Date.parse("2026-08-13T19:00:00.000Z");
  assert.equal(periodStartDay("7d", now), "2026-08-07");
  assert.equal(periodStartDay("30d", now), "2026-07-15");
  assert.equal(periodStartDay("all-time", now), null);
});

test("computeStreaks: current streak requires activity today or yesterday", () => {
  assert.deepEqual(computeStreaks(["2026-08-10", "2026-08-11", "2026-08-12"], "2026-08-13"), { current: 3, longest: 3 });
  assert.deepEqual(computeStreaks(["2026-08-01", "2026-08-02", "2026-08-10"], "2026-08-13"), { current: 0, longest: 2 });
});

test("unpublished cumulative rescan cannot drop published sessions on the private fold", () => {
  const published = [
    scannerChapter({
      chapterIndex: 1,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-02-01T00:00:00.000Z",
      sessions: [
        { sessionRef: "ses_a", startedAt: "2026-01-02T15:00:00.000Z", totalTokens: 100 },
        { sessionRef: "ses_b", startedAt: "2026-01-03T15:00:00.000Z", totalTokens: 80 },
      ],
      models: [{ name: "alpha", totalTokens: 180, costMicroUsd: 1_800_000 }],
    }),
  ];
  const unpublished = [
    scannerChapter({
      chapterIndex: 2,
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-03-01T00:00:00.000Z",
      sessions: [
        { sessionRef: "ses_a", startedAt: "2026-01-02T15:00:00.000Z", totalTokens: 40 },
        { sessionRef: "ses_c", startedAt: "2026-02-10T22:00:00.000Z", totalTokens: 20 },
      ],
      models: [{ name: "alpha", totalTokens: 60, costMicroUsd: 600_000 }],
    }),
  ];
  const replaced = foldChaptersToDailyRows([...published, ...unpublished]);
  const unioned = foldUnionToDailyRows(published, unpublished);
  const replacedSessions = replaced.filter((row) => row.modelKey === "__activity").reduce((sum, row) => sum + row.sessionCount, 0);
  const unionedSessions = unioned.filter((row) => row.modelKey === "__activity").reduce((sum, row) => sum + row.sessionCount, 0);
  assert.equal(replacedSessions, 2);
  assert.equal(unionedSessions, 3);
  const hours = hourlyFromSessions(unionUnpublishedOntoPublished(published, unpublished));
  assert.equal(hours[15]?.sessions, 2);
  assert.equal(hours[22]?.sessions, 1);
});
