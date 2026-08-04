const LEVELS = { error: 0, warn: 1, info: 2 } as const;

type LogLevel = keyof typeof LEVELS;

function enabled(level: LogLevel) {
  const configured = (process.env.BUILDSTORY_LOG_LEVEL ?? "info") as LogLevel;
  return LEVELS[level] <= (LEVELS[configured] ?? LEVELS.info);
}

/** Emits only fixed event names/codes. Never pass request bodies, URLs, tokens, or errors. */
export function logOperationalEvent(
  level: LogLevel,
  event: string,
  fields: { code?: string; status?: number } = {},
) {
  if (!enabled(level)) return;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "buildstory-web",
    event: event.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80),
    ...(fields.code
      ? { code: fields.code.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80) }
      : {}),
    ...(fields.status ? { status: fields.status } : {}),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
