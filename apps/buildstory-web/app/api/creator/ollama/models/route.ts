import { jsonError, requireApiCreator } from "@/lib/api/responses";
import { assertLoopbackApiRequest, isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { discoverOllamaModels } from "@/lib/narrative/ollama";

function queryNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  if (!isLocalApiEnabled()) {
    return jsonError("local_only", "Local Ollama discovery is available only in the development portal.", 404);
  }

  try {
    assertLoopbackApiRequest(request);
    const params = new URL(request.url).searchParams;
    const result = await discoverOllamaModels({
      deviceMemoryGiB: queryNumber(params.get("deviceMemoryGiB")),
      hardwareConcurrency: queryNumber(params.get("hardwareConcurrency")),
    });
    return Response.json(result, {
      headers: {
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && "status" in error) {
      const localError = error as Error & { code: string; status: number; message: string };
      return jsonError(localError.code, localError.message, localError.status);
    }
    return jsonError("ollama_discovery_failed", "The local model check failed safely.", 502);
  }
}
