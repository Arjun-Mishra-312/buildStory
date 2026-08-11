import { getD1 } from "@/db";
import { jsonError } from "@/lib/api/responses";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { getPublicStoryIdentityByReportId } from "@/lib/ingestion/store";
import { isStoryEventType, safeStoryEventFrameId } from "@/lib/story/events";

export const dynamic = "force-dynamic";

/** Records only anonymous, daily counters for the optional public Project Story. */
export async function POST(request: Request) {
  try {
    const { value } = await readBoundedJson(request, 4 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) return jsonError("invalid_story_event", "A story event object is required.", 422);
    const body = value as Record<string, unknown>;
    const reportId = typeof body.reportId === "string" ? body.reportId.slice(0, 120) : "";
    const eventType = body.eventType;
    if (!reportId || !isStoryEventType(eventType)) return jsonError("invalid_story_event", "A published report and valid event type are required.", 422);
    const identity = await getPublicStoryIdentityByReportId(reportId);
    if (!identity) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    const frameId = safeStoryEventFrameId(body.frameId);
    const eventDay = new Date().toISOString().slice(0, 10);
    const updatedAt = new Date().toISOString();
    await (await getD1()).prepare(
      `INSERT INTO buildstory_story_events (report_id, event_type, frame_id, event_day, count, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(report_id, event_type, frame_id, event_day)
       DO UPDATE SET count = MIN(count + 1, 1000000), updated_at = excluded.updated_at`,
    ).bind(reportId, eventType, frameId, eventDay, updatedAt).run();
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    // Analytics must never block a story view or reveal database state.
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
