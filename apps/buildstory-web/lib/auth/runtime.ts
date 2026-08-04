import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type AuthRuntimeMode = "google" | "development-bypass" | "disabled";

export type CreatorSession = {
  creatorId: string;
  name: string;
  email: string;
  image: string | null;
  mode: "google" | "development-bypass";
};

export function getAuthRuntimeMode(): AuthRuntimeMode {
  const googleReady = Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_SECRET.length >= 32 &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
  if (googleReady) return "google";

  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.BUILDSTORY_DEV_AUTH_BYPASS === "true";
  return devBypass ? "development-bypass" : "disabled";
}

export async function getCreatorSession(): Promise<CreatorSession | null> {
  const mode = getAuthRuntimeMode();
  if (mode === "development-bypass") {
    return {
      creatorId: "dev:mina-park",
      name: "Mina Park",
      email: "dev@buildstory.local",
      image: null,
      mode,
    };
  }
  if (mode === "disabled") return null;

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    creatorId: session.user.id,
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    image: session.user.image ?? null,
    mode: "google",
  };
}

export async function requireCreator(
  returnTo = "/dashboard",
): Promise<CreatorSession> {
  const creator = await getCreatorSession();
  if (creator) return creator;
  redirect(`/signin?callbackUrl=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const url = new URL(value, "https://buildstory.local");
    if (url.origin !== "https://buildstory.local") return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}
