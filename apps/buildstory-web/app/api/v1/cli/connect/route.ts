import { ingestionErrorResponse } from "@/lib/api/responses";
import type { LocalConnectResponse } from "@/lib/ingestion/contracts";
import {
  assertCliRequest,
  LOCAL_CONNECT_MAX_BYTES,
  localApiResponseHeaders,
  readBoundedJson,
} from "@/lib/ingestion/local-api";
import { parseLocalConnectRequest } from "@/lib/ingestion/local-contract";
import { claimUploadSession } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

/**
 * Device handshake: loopback-only in development, the configured public
 * origin only in production. Browser cookies are ignored; the copied
 * one-time device code is the only credential accepted here.
 */
export async function POST(request: Request) {
  try {
    assertCliRequest(request);
    await checkRateLimit("cli_connect", request.headers.get("cf-connecting-ip") ?? "anonymous", 30, 60, request);
    const { value } = await readBoundedJson(request, LOCAL_CONNECT_MAX_BYTES);
    const connection = parseLocalConnectRequest(value);
    const headerVersion = request.headers.get("x-buildstory-client-version");
    if (headerVersion && headerVersion !== connection.client.version) {
      return Response.json(
        {
          error: {
            code: "client_version_mismatch",
            message:
              "X-BuildStory-Client-Version must match client.version in the connection request.",
          },
        },
        { status: 400, headers: localApiResponseHeaders },
      );
    }

    const claim = await claimUploadSession(
      connection.uploadSessionId,
      connection.deviceCode,
      connection.capabilities.narrativeModes,
    );
    const response: LocalConnectResponse = {
      protocolVersion: "1.0",
      status: "connected",
      uploadSessionId: connection.uploadSessionId,
      connectionId: claim.connectionId,
      uploadGrant: claim.uploadGrant,
      ...(claim.narrative && connection.capabilities.narrativeModes ? { narrative: claim.narrative } : {}),
    };
    return Response.json(response, {
      status: 200,
      headers: localApiResponseHeaders,
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
