import { ingestionErrorResponse } from "@/lib/api/responses";
import {
  assertCliRequest,
  LOCAL_CONNECT_MAX_BYTES,
  localApiResponseHeaders,
  readBoundedJson,
} from "@/lib/ingestion/local-api";
import { parseCliPairPollRequest } from "@/lib/ingestion/local-contract";
import { pollCliPairing } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function POST(request: Request) {
  try {
    assertCliRequest(request);
    await checkRateLimit("cli_pair_poll", request.headers.get("cf-connecting-ip") ?? "anonymous", 60, 60, request);
    const { value } = await readBoundedJson(request, LOCAL_CONNECT_MAX_BYTES);
    const poll = parseCliPairPollRequest(value);
    const result = await pollCliPairing(poll.pairingId);
    if ("pending" in result) {
      return new Response(null, { status: 202, headers: localApiResponseHeaders });
    }
    return Response.json(result, { status: 200, headers: localApiResponseHeaders });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
