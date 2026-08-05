import { ingestionErrorResponse, jsonError } from "@/lib/api/responses";
import type { LocalSnapshotAcceptedResponse } from "@/lib/ingestion/contracts";
import {
  assertCliRequest,
  bearerToken,
  localApiResponseHeaders,
  readBoundedJson,
} from "@/lib/ingestion/local-api";
import { sha256Digest } from "@/lib/ingestion/local-contract";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "@/lib/ingestion/scanner-project-snapshot";
import { acceptSnapshot } from "@/lib/ingestion/store";
import { MAX_SNAPSHOT_BYTES } from "@/lib/ingestion/validation";

type RouteContext = { params: Promise<{ sessionId: string }> };

/** Accepts exactly one validated ProjectSnapshot for a short-lived grant. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    assertCliRequest(request);
    const token = bearerToken(request);
    if (!token) {
      return jsonError(
        "missing_upload_token",
        "Send the one-time upload grant as Authorization: Bearer <token>.",
        401,
      );
    }
    if (request.headers.get("x-buildstory-schema-version") !== PROJECT_SNAPSHOT_SCHEMA_VERSION) {
      return jsonError(
        "unsupported_schema_version",
        `Send X-BuildStory-Schema-Version: ${PROJECT_SNAPSHOT_SCHEMA_VERSION} and a matching ProjectSnapshot body.`,
        400,
      );
    }

    const declaredDigest =
      request.headers.get("x-buildstory-snapshot-digest")?.trim() ?? "";
    const { raw, value } = await readBoundedJson(request, MAX_SNAPSHOT_BYTES);
    const computedDigest = await sha256Digest(raw);
    if (declaredDigest !== computedDigest) {
      return jsonError(
        "snapshot_digest_mismatch",
        "X-BuildStory-Snapshot-Digest does not match the exact uploaded JSON bytes. Rebuild the canonical snapshot and retry with the same unconsumed grant.",
        422,
      );
    }

    const { sessionId } = await context.params;
    const receipt = await acceptSnapshot(
      sessionId,
      token,
      declaredDigest,
      value,
    );
    const response: LocalSnapshotAcceptedResponse = {
      protocolVersion: "1.0",
      status: "accepted",
      receipt: {
        receiptId: receipt.receiptId,
        scanId: receipt.scanId,
        snapshotDigest: receipt.snapshotDigest,
        acceptedAt: receipt.acceptedAt,
      },
      statusUrl: receipt.statusEndpoint,
      reportUrl: receipt.reportEndpoint,
    };
    return Response.json(response, {
      status: 202,
      headers: localApiResponseHeaders,
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
