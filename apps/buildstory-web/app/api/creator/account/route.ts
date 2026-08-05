import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { deleteAccount } from "@/lib/account/store";
import { signOut } from "@/auth";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

/**
 * Permanent, irreversible account deletion. Requires the signed-in
 * creator to type their own exact handle as confirmation, on top of the
 * usual same-origin browser-mutation check - this is the one action in the
 * product a single accidental click could never undo.
 */
export async function DELETE(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    const body = (await request.json().catch(() => null)) as { confirmHandle?: unknown } | null;
    if (typeof body?.confirmHandle !== "string" || body.confirmHandle !== user.handle) {
      return jsonError(
        "confirmation_required",
        "Send confirmHandle equal to your exact handle to confirm permanent deletion.",
        422,
      );
    }
    await deleteAccount(user.id);
    await signOut({ redirect: false, redirectTo: "/" });
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
