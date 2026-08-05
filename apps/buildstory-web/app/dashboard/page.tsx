import type { Metadata } from "next";
import Link from "next/link";
import { requireCreator } from "@/lib/auth/runtime";
import { listUploadSessions, statusLabel } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Creator dashboard" };

export default async function DashboardPage() {
  const creator = await requireCreator("/dashboard");
  const sessions = await listUploadSessions(creator.creatorId);
  const ready = sessions.filter((session) => session.status === "report_ready");
  const processing = sessions.filter((session) =>
    ["scanner_authorized", "snapshot_received", "queued", "generating"].includes(session.status),
  );

  return (
    <main className="creator-page dashboard-page">
      <header className="creator-page__heading">
        <div>
          <span className="section-index">( CREATOR DASHBOARD )</span>
          <h1>Good morning, {creator.name.split(" ")[0]}.</h1>
          <p>Your private build queue, reports, and publication state in one place.</p>
        </div>
        <Link className="button button--primary" href="/dashboard/connect">
          Connect a local project <span aria-hidden="true">→</span>
        </Link>
      </header>

      <section className="dashboard-metrics" aria-label="Workspace summary">
        <article><span>READY REPORTS</span><strong>{ready.length}</strong><small>{ready.length ? "Ready to review" : "Connect your first"}</small></article>
        <article><span>IN THE QUEUE</span><strong>{processing.length}</strong><small>generation jobs</small></article>
        <article><span>SCANNER TRUST</span><strong>1×</strong><small>single-use upload tokens</small></article>
        <article><span>PUBLIC ACCESS</span><strong>Open</strong><small>no viewer sign-in</small></article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-projects">
          <header><span>YOUR PROJECTS</span><Link href="/dashboard/connect">Add project +</Link></header>
          {ready.length ? ready.map((session) => (
            <Link
              className="dashboard-project-card"
              href={`/dashboard/reports/${session.reportId}`}
              key={session.id}
            >
              <div className="dashboard-project-card__cover" aria-hidden="true">
                <span /><span /><i />
                <b>ON / 0.1</b>
              </div>
              <div className="dashboard-project-card__body">
                <div><span className="status-dot status-dot--shipped" /> REPORT READY</div>
                <h2>{session.projectLabel}</h2>
                <dl>
                  <div><dt>Report</dt><dd>Ready</dd></div>
                  <div><dt>Snapshot</dt><dd>Validated</dd></div>
                </dl>
              </div>
              <span className="dashboard-project-card__arrow" aria-hidden="true">↗</span>
            </Link>
          )) : (
            <div className="dashboard-empty">
              <span>NO PRIVATE REPORTS YET</span>
              <h2>Your first project begins on your machine.</h2>
              <p>Create a connection code here, then run the local scanner against the repository you choose.</p>
              <Link className="button button--secondary" href="/dashboard/connect">Open scanner connection</Link>
            </div>
          )}
        </section>

        <aside className="dashboard-activity">
          <header><span>INGESTION ACTIVITY</span><small>{sessions.length} total</small></header>
          <div className="activity-list">
            {sessions.slice(0, 5).map((session) => (
              <article key={session.id}>
                <i className={`activity-state activity-state--${session.status}`} />
                <div><strong>{session.projectLabel}</strong><p>{session.statusDetail}</p></div>
                <small>{statusLabel(session.status)}</small>
              </article>
            ))}
            {!sessions.length ? <p className="activity-list__empty">No scanner activity yet.</p> : null}
          </div>
          <div className="dashboard-activity__boundary">
            <span>THE HANDOFF</span>
            <ol>
              <li>Creator starts a session</li>
              <li>Scanner claims one code</li>
              <li>Token uploads one snapshot</li>
              <li>Backend queues the report</li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}
