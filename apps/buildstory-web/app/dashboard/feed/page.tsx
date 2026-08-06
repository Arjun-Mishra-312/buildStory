import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = { title: "Feed" };

export default function DashboardFeedPage() {
  permanentRedirect("/");
}
