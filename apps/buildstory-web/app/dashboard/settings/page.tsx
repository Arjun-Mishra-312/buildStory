import { permanentRedirect } from "next/navigation";

export default function DashboardSettingsPage() {
  permanentRedirect("/studio/settings");
}
