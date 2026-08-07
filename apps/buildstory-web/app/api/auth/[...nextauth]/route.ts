import { handlers } from "@/auth";
import { getAuthRuntimeMode } from "@/lib/auth/runtime";

function disabledAuthResponse() {
  return Response.json(
    {
      error: {
        code: "auth_disabled",
        message: "OAuth sign-in is not configured in this environment.",
      },
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

export const GET =
  getAuthRuntimeMode() === "oauth" ? handlers.GET : disabledAuthResponse;
export const POST =
  getAuthRuntimeMode() === "oauth" ? handlers.POST : disabledAuthResponse;
