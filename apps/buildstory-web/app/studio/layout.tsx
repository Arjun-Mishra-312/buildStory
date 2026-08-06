import { requireCreator } from "@/lib/auth/runtime";
import { StudioNav } from "@/components/studio/studio-nav";
import { ensureUser } from "@/lib/ingestion/store";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const creator = await requireCreator("/studio");
  const user = await ensureUser(creator);
  return <StudioNav role={user.role}>{children}</StudioNav>;
}
