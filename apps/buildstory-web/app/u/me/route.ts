import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/ingestion/store";
import { requireCreator } from "@/lib/auth/runtime";

export async function GET() {
  const creator = await requireCreator("/u/me");
  const user = await ensureUser(creator);
  redirect(`/u/${user.handle}`);
}
