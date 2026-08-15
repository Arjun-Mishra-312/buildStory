import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBadges, evaluateLeague, formatDuration } from "../lib/badges/evaluate";
import type { EvaluateBadgesInput } from "../lib/badges/evaluate";
import { assembleProfileBadges, pickShowcase } from "../lib/badges/assemble";
import type { PublicBadgeAward } from "../lib/badges/contracts";
import { toPublicAward } from "../lib/badges/assemble";
import type { BadgeAwardRecord } from "../lib/badges/contracts";

function emptyUsage(): EvaluateBadgesInput["usage"] {
  return { currentStreak: 0, longestStreak: 0, days: [] };
}

function baseInput(overrides: Partial<EvaluateBadgesInput> = {}): EvaluateBadgesInput {
  return {
    projects: [],
    usage: emptyUsage(),
    publishedStoryCount: 0,
    maxChapterIndex: 0,
    hasVerifiedPublishedRepo: false,
    ranks: [],
    ...overrides,
  };
}

function session(args: { ref?: string; minutes: number; tokens?: number; start?: string }) {
  const start = args.start ?? "2026-08-03T10:00:00.000Z";
  const end = new Date(Date.parse(start) + args.minutes * 60_000).toISOString();
  return {
    sessionRef: args.ref ?? "ses_a",
    startedAt: start,
    endedAt: end,
    durationMinutes: args.minutes,
    totalTokens: args.tokens ?? 0,
  };
}

test("evaluate: duration ladders award every threshold met, and skip just-below", () => {
  const below = evaluateBadges(
    baseInput({
      projects: [{ projectId: "p1", chapterId: "c1", sessions: [session({ minutes: 4 * 60 - 1 })] }],
    }),
  );
  assert.equal(below.some((row) => row.badgeId === "dawn-watch"), false);

  const dawn = evaluateBadges(
    baseInput({
      projects: [{ projectId: "p1", chapterId: "c1", sessions: [session({ minutes: 4 * 60 })] }],
    }),
  );
  assert.deepEqual(dawn.map((row) => row.badgeId), ["dawn-watch"]);

  const iron = evaluateBadges(
    baseInput({
      projects: [{ projectId: "p1", chapterId: "c1", sessions: [session({ minutes: 12 * 60 })] }],
    }),
  );
  assert.deepEqual(iron.map((row) => row.badgeId).sort(), ["dawn-watch", "iron-session"]);

  const sleep = evaluateBadges(
    baseInput({
      projects: [{ projectId: "p1", chapterId: "c1", sessions: [session({ minutes: 24 * 60 })] }],
    }),
  );
  assert.deepEqual(sleep.map((row) => row.badgeId).sort(), ["dawn-watch", "iron-session", "sleepless"]);
  assert.equal(sleep[0]?.evidence.unit, "minutes");
  assert.match(sleep[0]?.evidence.label ?? "", /24h session/);
});

test("evaluate: token ladders use the heaviest session and skip just-below", () => {
  const below = evaluateBadges(
    baseInput({
      projects: [{ projectId: "p1", chapterId: "c1", sessions: [session({ minutes: 10, tokens: 999_999 })] }],
    }),
  );
  assert.equal(below.some((row) => row.badgeId === "heavyweight"), false);

  const titan = evaluateBadges(
    baseInput({
      projects: [
        {
          projectId: "p1",
          chapterId: "c1",
          sessions: [
            session({ ref: "small", minutes: 10, tokens: 2_000_000 }),
            session({ ref: "big", minutes: 10, tokens: 500_000_000, start: "2026-08-04T00:00:00.000Z" }),
          ],
        },
      ],
    }),
  );
  assert.deepEqual(titan.map((row) => row.badgeId).sort(), ["furnace", "heavyweight", "token-titan"]);
  assert.equal(titan[0]?.evidence.sessionRef, "big");
  assert.equal(titan[0]?.sourceProjectId, "p1");
});

test("evaluate: streak, craft, and league thresholds including just-below negatives", () => {
  const streakSix = evaluateBadges(baseInput({ usage: { currentStreak: 6, longestStreak: 6, days: [] } }));
  assert.equal(streakSix.some((row) => row.badgeId === "seven-suns"), false);

  const streakSeven = evaluateBadges(baseInput({ usage: { currentStreak: 7, longestStreak: 3, days: [] } }));
  assert.equal(streakSeven.some((row) => row.badgeId === "seven-suns"), true);

  const month = evaluateBadges(baseInput({ usage: { currentStreak: 0, longestStreak: 30, days: [] } }));
  assert.deepEqual(month.map((row) => row.badgeId).sort(), ["month-of-making", "seven-suns"]);

  const century = evaluateBadges(baseInput({ usage: { currentStreak: 0, longestStreak: 100, days: [] } }));
  assert.ok(century.some((row) => row.badgeId === "century"));

  const first = evaluateBadges(baseInput({ publishedStoryCount: 1 }));
  assert.ok(first.some((row) => row.badgeId === "first-light"));
  assert.equal(evaluateBadges(baseInput({ publishedStoryCount: 0 })).length, 0);

  const chapter = evaluateBadges(baseInput({ publishedStoryCount: 1, maxChapterIndex: 2 }));
  assert.ok(chapter.some((row) => row.badgeId === "chapter-two"));
  assert.equal(evaluateBadges(baseInput({ publishedStoryCount: 1, maxChapterIndex: 1 })).some((row) => row.badgeId === "chapter-two"), false);

  const verified = evaluateBadges(baseInput({ publishedStoryCount: 1, hasVerifiedPublishedRepo: true }));
  assert.ok(verified.some((row) => row.badgeId === "verified-trail"));

  const polyglot = evaluateBadges(
    baseInput({
      publishedStoryCount: 1,
      usage: {
        currentStreak: 0,
        longestStreak: 0,
        days: [
          {
            day: "2026-08-01",
            sessionCount: 1,
            models: [
              { key: "a", label: "A", tokens: 1, spendMicroUsd: null },
              { key: "b", label: "B", tokens: 1, spendMicroUsd: null },
              { key: "c", label: "C", tokens: 1, spendMicroUsd: null },
              { key: "__activity", label: "", tokens: 0, spendMicroUsd: null },
            ],
          },
          {
            day: "2026-08-02",
            sessionCount: 1,
            models: [{ key: "d", label: "D", tokens: 1, spendMicroUsd: null }],
          },
        ],
      },
    }),
  );
  assert.ok(polyglot.some((row) => row.badgeId === "polyglot"));
  const threeModels = evaluateBadges(
    baseInput({
      publishedStoryCount: 1,
      usage: {
        currentStreak: 0,
        longestStreak: 0,
        days: [
          {
            day: "2026-08-01",
            sessionCount: 1,
            models: [
              { key: "a", label: "A", tokens: 1, spendMicroUsd: null },
              { key: "b", label: "B", tokens: 1, spendMicroUsd: null },
              { key: "c", label: "C", tokens: 1, spendMicroUsd: null },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(threeModels.some((row) => row.badgeId === "polyglot"), false);
});

test("evaluate: league ranks, first-earn uniqueness, and duration formatting", () => {
  const none = evaluateLeague([]);
  assert.equal(none.length, 0);

  const board = evaluateLeague([{ period: "30d", rankSpend: 40, rankTokens: 22 }]);
  assert.deepEqual(board.map((row) => row.badgeId), ["on-the-board"]);

  const podiumMiss = evaluateLeague([{ period: "all-time", rankSpend: 11, rankTokens: 11 }]);
  assert.equal(podiumMiss.some((row) => row.badgeId === "podium"), false);

  const podiumHit = evaluateLeague([{ period: "all-time", rankSpend: 10, rankTokens: 50 }]);
  assert.ok(podiumHit.some((row) => row.badgeId === "podium"));

  const champ = evaluateLeague([
    { period: "7d", rankSpend: 4, rankTokens: 1 },
    { period: "all-time", rankSpend: 20, rankTokens: 20 },
  ]);
  assert.ok(champ.some((row) => row.badgeId === "league-champion"));
  assert.ok(champ.some((row) => row.badgeId === "on-the-board"));

  const mixed = evaluateBadges(
    baseInput({
      publishedStoryCount: 1,
      ranks: [{ period: "all-time", rankSpend: 1, rankTokens: 3 }],
    }),
  );
  const ids = mixed.map((row) => row.badgeId);
  assert.equal(ids.filter((id) => id === "first-light").length, 1);
  assert.equal(ids.filter((id) => id === "league-champion").length, 1);
  assert.equal(formatDuration(12 * 60 + 18), "12h 18m");
});

test("assemble: default showcase is highest rarity then newest; pins win; locked only for owner", () => {
  const records: BadgeAwardRecord[] = [
    {
      id: "1",
      userId: "u",
      badgeId: "dawn-watch",
      earnedAt: "2026-08-02T00:00:00.000Z",
      evidence: { value: 240, unit: "minutes", label: "4h" },
      sourceProjectId: "p1",
      sourceChapterId: null,
      pinnedRank: null,
    },
    {
      id: "2",
      userId: "u",
      badgeId: "iron-session",
      earnedAt: "2026-08-01T00:00:00.000Z",
      evidence: { value: 720, unit: "minutes", label: "12h" },
      sourceProjectId: "p1",
      sourceChapterId: null,
      pinnedRank: null,
    },
    {
      id: "3",
      userId: "u",
      badgeId: "first-light",
      earnedAt: "2026-08-03T00:00:00.000Z",
      evidence: { value: 1, unit: "count", label: "first" },
      sourceProjectId: null,
      sourceChapterId: null,
      pinnedRank: 1,
    },
  ];
  const publicAwards = records.map((record) => toPublicAward(record, record.sourceProjectId ? "/u/x/y" : null));
  const defaults = pickShowcase(publicAwards.map((award) => ({ ...award, pinnedRank: null })));
  assert.equal(defaults[0]?.badgeId, "iron-session");

  const pinned = assembleProfileBadges(publicAwards, true);
  assert.equal(pinned.showcase[0]?.badgeId, "first-light");
  assert.ok(pinned.locked.length > 0);
  assert.equal(assembleProfileBadges(publicAwards, false).locked.length, 0);
});

test("assemble: first-earn-wins is a store concern; evaluator still returns the original evidence object per badge", () => {
  const awards = evaluateBadges(
    baseInput({
      projects: [
        { projectId: "older", chapterId: "c1", sessions: [session({ minutes: 12 * 60, start: "2026-01-01T00:00:00.000Z" })] },
        { projectId: "newer", chapterId: "c2", sessions: [session({ minutes: 30 * 60, start: "2026-08-01T00:00:00.000Z" })] },
      ],
    }),
  );
  const iron = awards.find((row) => row.badgeId === "iron-session");
  assert.equal(iron?.sourceProjectId, "newer");
  const publicAward: PublicBadgeAward = toPublicAward(
    {
      id: "kept",
      userId: "u",
      badgeId: "iron-session",
      earnedAt: "2026-01-01T00:00:00.000Z",
      evidence: { value: 720, unit: "minutes", label: "kept" },
      sourceProjectId: "older",
      sourceChapterId: "c1",
      pinnedRank: null,
    },
    "/u/h/older",
  );
  assert.equal(publicAward.sourceProjectId, "older");
});
