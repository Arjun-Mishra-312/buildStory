import { initialsFrom } from "@/lib/identity/initials";
import type { CreatorSession } from "@/lib/auth/runtime";

export type Viewer = {
  name: string;
  initials: string;
  avatarUrl: string | null;
  isDevBypass: boolean;
};

export function viewerFromSession(creator: CreatorSession | null): Viewer | null {
  if (!creator) return null;
  return {
    name: creator.name,
    initials: initialsFrom(creator.name),
    avatarUrl: creator.image,
    isDevBypass: creator.mode === "development-bypass",
  };
}
