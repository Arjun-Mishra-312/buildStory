import { getCreatorSession } from "@/lib/auth/runtime";
import type { ApiErrorBody } from "@/lib/ingestion/contracts";
import { LocalApiRequestError } from "@/lib/ingestion/local-api";
import { logOperationalEvent } from "@/lib/observability/log";
import { SocialError } from "@/lib/social/contracts";

type IngestionError = Error & {
  isBuildstoryIngestionError: true;
  code: string;
  status: number;
  details?: string[];
};

function isIngestionError(error: unknown): error is IngestionError {
  if (!(error instanceof Error)) return false;
  const candidate = error as Partial<IngestionError>;
  return (
    candidate.isBuildstoryIngestionError === true &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number"
  );
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: string[],
) {
  const body: ApiErrorBody = { error: { code, message, details } };
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function requireApiCreator() {
  return getCreatorSession();
}

export function ingestionErrorResponse(error: unknown) {
  if (
    isIngestionError(error) ||
    error instanceof LocalApiRequestError
  ) {
    if (error.status >= 500) {
      logOperationalEvent("error", "ingestion.request_failed", {
        code: error.code,
        status: error.status,
      });
    }
    return jsonError(error.code, error.message, error.status, error.details);
  }
  logOperationalEvent("error", "ingestion.unexpected_failure", {
    code: "internal_error",
    status: 500,
  });
  return jsonError("internal_error", "The ingestion service failed safely.", 500);
}

export function socialErrorResponse(error: unknown) {
  if (isIngestionError(error) || error instanceof SocialError) {
    if (error.status >= 500) {
      logOperationalEvent("error", "social.request_failed", {
        code: error.code,
        status: error.status,
      });
    }
    return jsonError(error.code, error.message, error.status, error.details);
  }
  logOperationalEvent("error", "social.unexpected_failure", {
    code: "internal_error",
    status: 500,
  });
  return jsonError("internal_error", "The social service failed safely.", 500);
}
