"use client";

import { useState } from "react";
import type { ContentReportRecord } from "@/lib/social/contracts";

export function ModerationQueue({ initialReports }: { initialReports: ContentReportRecord[] }) {
  const [reports, setReports] = useState(initialReports);
  async function resolve(id: string, status: "actioned" | "dismissed") {
    const response = await fetch(`/api/content-reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) setReports((current) => current.map((report) => report.id === id ? { ...report, status, resolvedAt: new Date().toISOString() } : report));
  }
  return <div className="moderation-queue">{reports.length === 0 ? <p>No reports in this queue.</p> : reports.map((report) => <article className="report-card" key={report.id}><span className="section-index">{report.targetType} · {report.reasonCode}</span><h2>{report.targetId}</h2>{report.note ? <p>{report.note}</p> : null}<small>{new Date(report.createdAt).toLocaleString()}</small>{report.status === "open" ? <div><button className="button button--primary button--small" onClick={() => void resolve(report.id, "actioned")}>Action</button><button className="button button--secondary button--small" onClick={() => void resolve(report.id, "dismissed")}>Dismiss</button></div> : <strong>{report.status}</strong>}</article>)}</div>;
}
