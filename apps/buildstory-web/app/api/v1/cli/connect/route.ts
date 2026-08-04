import { ingestionErrorResponse } from "@/lib/api/responses";
import type { LocalConnectResponse } from "@/lib/ingestion/contracts";
import {
  assertLoopbackApiRequest,
  LOCAL_CONNECT_MAX_BYTES,
  localApiResponseHeaders,
  readBoundedJson,
} from "@/lib/ingestion/local-api";
import { parseLocalConnectRequest } from "@/lib/ingestion/local-contract";
import { claimUploadSession } from "@/lib/ingestion/store";

/**
 * Loopback-only device handshake. Browser cookies are ignored; the copied
 * one-time device code is the only credential accepted here.
 */
export async function POST(request: Request) {
  try {
    assertLoopbackApiRequest(request);
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
    );
    const response: LocalConnectResponse = {
      protocolVersion: "1.0",
      status: "connected",
      uploadSessionId: connection.uploadSessionId,
      connectionId: claim.connectionId,
      uploadGrant: claim.uploadGrant,
    };
    return Response.json(response, {
      status: 200,
      headers: localApiResponseHeaders,
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
