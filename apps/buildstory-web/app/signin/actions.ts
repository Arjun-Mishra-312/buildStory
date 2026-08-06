"use server";

import { signIn } from "@/auth";
import { signOut } from "@/auth";
import { getAuthRuntimeMode, safeReturnPath } from "@/lib/auth/runtime";

export async function signInWithGoogle(formData: FormData) {
  if (getAuthRuntimeMode() !== "google") return;
  const callbackUrl = safeReturnPath(
    formData.get("callbackUrl")?.toString(),
  );
  await signIn("google", { redirectTo: callbackUrl });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
