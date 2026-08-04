import { handlers } from "@/auth";
import { getAuthRuntimeMode } from "@/lib/auth/runtime";

function disabledAuthResponse() {
  return Response.json(
    {
      error: {
        code: "auth_disabled",
        message: "Google OAuth is not configured in this environment.",
      },
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

export const GET =
  getAuthRuntimeMode() === "google" ? handlers.GET : disabledAuthResponse;
export const POST =
  getAuthRuntimeMode() === "google" ? handlers.POST : disabledAuthResponse;
