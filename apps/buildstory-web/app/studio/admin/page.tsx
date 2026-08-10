import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminUserPanel } from "@/components/admin-user-panel";
import { requireCreator } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const creator = await requireCreator("/studio/admin");
  const user = await ensureUser(creator);
  if (user.role !== "admin") notFound();
  return (
    <section className="creator-page admin-page">
      <span className="section-index">( ADMIN )</span>
      <h1>Grant staff access.</h1>
      <p>Promote a builder to moderator or admin by handle. Moderators can review reports and suspend accounts from the moderation queue; admins can also change roles.</p>
      <AdminUserPanel />
    </section>
  );
}
