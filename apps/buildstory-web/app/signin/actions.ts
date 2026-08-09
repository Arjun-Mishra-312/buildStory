"use server";

import { signIn } from "@/auth";
import { signOut } from "@/auth";
import { isGithubOAuthConfigured, isGoogleOAuthConfigured, safeReturnPath } from "@/lib/auth/runtime";

export async function signInWithGoogle(formData: FormData) {
  if (!isGoogleOAuthConfigured()) return;
  const callbackUrl = safeReturnPath(
    formData.get("callbackUrl")?.toString(),
  );
  await signIn("google", { redirectTo: `/onboarding?next=${encodeURIComponent(callbackUrl)}` });
}

export async function signInWithGithub(formData: FormData) {
  if (!isGithubOAuthConfigured()) return;
  const callbackUrl = safeReturnPath(
    formData.get("callbackUrl")?.toString(),
  );
  await signIn("github", { redirectTo: `/onboarding?next=${encodeURIComponent(callbackUrl)}` });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
