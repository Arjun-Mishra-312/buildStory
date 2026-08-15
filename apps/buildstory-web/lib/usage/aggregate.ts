import { USAGE_ACTIVITY_MODEL, computeStreaks, utcDay, type UsageDailyRow } from "./fold";
import type { ProfileUsage, ProfileUsageDay } from "./contracts";

export function aggregateProfileUsage(rows: UsageDailyRow[], rank: number | null, today = utcDay(new Date().toISOString())): ProfileUsage {
  const modelSpend = new Map<string, { label: string; spend: number; priced: boolean }>();
  const dayMap = new Map<string, ProfileUsageDay>();
  let spend = 0;
  let priced = false;
  let tokens = 0;
  let unpricedTokens = 0;
  let sessionCount = 0;
  const active = new Set<string>();

  for (const row of rows) {
    active.add(row.day);
    const day = dayMap.get(row.day) ?? { day: row.day, sessionCount: 0, models: [] };
    if (row.modelKey === USAGE_ACTIVITY_MODEL) {
      sessionCount += row.sessionCount;
      day.sessionCount += row.sessionCount;
      dayMap.set(row.day, day);
      continue;
    }
    tokens += row.tokens;
    if (row.costMicroUsd == null) unpricedTokens += row.tokens;
    else {
      spend += row.costMicroUsd;
      priced = true;
    }
    const existingModel = modelSpend.get(row.modelKey) ?? { label: row.modelLabel || row.modelKey, spend: 0, priced: false };
    if (row.costMicroUsd != null) {
      existingModel.spend += row.costMicroUsd;
      existingModel.priced = true;
    }
    if (row.modelLabel) existingModel.label = row.modelLabel;
    modelSpend.set(row.modelKey, existingModel);

    const model = day.models.find((item) => item.key === row.modelKey);
    if (model) {
      model.tokens += row.tokens;
      if (row.costMicroUsd != null || model.spendMicroUsd != null) {
        model.spendMicroUsd = (model.spendMicroUsd ?? 0) + (row.costMicroUsd ?? 0);
      }
    } else {
      day.models.push({
        key: row.modelKey,
        label: row.modelLabel || row.modelKey,
        tokens: row.tokens,
        spendMicroUsd: row.costMicroUsd,
      });
    }
    dayMap.set(row.day, day);
  }

  let topSpendModel: ProfileUsage["topSpendModel"] = null;
  for (const [key, model] of modelSpend) {
    if (!model.priced) continue;
    if (!topSpendModel || model.spend > (modelSpend.get(topSpendModel.key)?.spend ?? 0)) {
      topSpendModel = { key, label: model.label };
    }
  }

  const days = Array.from(dayMap.values()).sort((left, right) => left.day.localeCompare(right.day));
  const streaks = computeStreaks(Array.from(active), today);
  const lastActiveAt = days.length > 0 ? days[days.length - 1]!.day : null;

  return {
    spendMicroUsd: priced ? spend : null,
    tokens,
    unpricedTokens,
    sessionCount,
    activeDays: active.size,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    lastActiveAt,
    topSpendModel,
    rank,
    days,
  };
}

export const EMPTY_PROFILE_USAGE: ProfileUsage = {
  spendMicroUsd: null,
  tokens: 0,
  unpricedTokens: 0,
  sessionCount: 0,
  activeDays: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveAt: null,
  topSpendModel: null,
  rank: null,
  days: [],
};
