import { CreatorShell } from "@/components/creator/creator-shell";
import { requireCreator } from "@/lib/auth/runtime";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const creator = await requireCreator("/dashboard");
  return <CreatorShell creator={creator}>{children}</CreatorShell>;
}
