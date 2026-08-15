import { ingestionErrorResponse } from "@/lib/api/responses";
import type { LocalPairStartResponse } from "@/lib/ingestion/contracts";
import {
  assertCliRequest,
  LOCAL_CONNECT_MAX_BYTES,
  cliApiBaseUrl,
  localApiResponseHeaders,
  readBoundedJson,
} from "@/lib/ingestion/local-api";
import { parseCliPairStartRequest } from "@/lib/ingestion/local-contract";
import { startCliPairing } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function POST(request: Request) {
  try {
    assertCliRequest(request);
    await checkRateLimit("cli_pair_start", request.headers.get("cf-connecting-ip") ?? "anonymous", 30, 60, request);
    const { value } = await readBoundedJson(request, LOCAL_CONNECT_MAX_BYTES);
    const pairing = parseCliPairStartRequest(value);
    const started = await startCliPairing(pairing.projectLabel, pairing.narrativeMode, cliApiBaseUrl(request));
    const response: LocalPairStartResponse = started;
    return Response.json(response, { status: 200, headers: localApiResponseHeaders });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
