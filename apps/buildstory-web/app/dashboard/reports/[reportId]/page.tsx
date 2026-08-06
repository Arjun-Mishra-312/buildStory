import { permanentRedirect } from "next/navigation";

type PageProps = { params: Promise<{ reportId: string }> };

export default async function DashboardReportPage({ params }: PageProps) {
  const { reportId } = await params;
  permanentRedirect(`/studio/reports/${reportId}`);
}
