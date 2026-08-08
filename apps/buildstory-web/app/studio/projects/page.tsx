import type { Metadata } from "next";
import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { requireCreator } from "@/lib/auth/runtime";
import { listProjects } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Your projects" };

const publicationLabel: Record<string, string> = {
  not_published: "Not published",
  draft_changes: "Unpublished changes",
  published: "Published",
};

export default async function ProjectsPage() {
  const creator = await requireCreator("/studio/projects");
  const projects = await listProjects(creator.creatorId);

  return (
    <section className="creator-page projects-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( YOUR PROJECTS )</span>
          <h1>Every project you&apos;ve scanned.</h1>
          <p>One row per project, not per scan. Re-scan a project any time to publish an update as a new chapter.</p>
        </div>
      </header>

      {projects.length ? (
        <div className="project-list">
          {projects.map((project) => (
            <article className="project-row" key={project.id}>
              <div className="project-row__identity">
                <h2>{project.name}</h2>
                <div className="project-row__meta">
                  <span>{project.chapterCount ? `${project.chapterCount} published chapter${project.chapterCount === 1 ? "" : "s"}` : "Not yet published"}</span>
                  <span className={`publication-state publication-state--${project.latestPublicationStatus}`}>
                    <i /> {publicationLabel[project.latestPublicationStatus] ?? project.latestPublicationStatus}
                  </span>
                </div>
              </div>
              <div className="project-row__actions">
                {project.publicUrl ? (
                  <a className="button button--text" href={project.publicUrl} target="_blank" rel="noopener noreferrer">
                    View public page <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
                <Link className="button button--secondary button--small" href={`/studio/projects/${project.id}`}>
                  Review project
                </Link>
                <Link className="button button--primary button--small" href={`/studio/projects/${project.id}/update`}>
                  {project.chapterCount ? "Publish an update" : "Scan and publish"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <div className="dashboard-empty__art"><EditorialIllustration kind="studio-first-story" /></div>
          <div className="dashboard-empty__copy">
            <span>NO PROJECTS YET</span>
            <h2>Your first project begins on your machine.</h2>
            <p>Create a connection code and run the local scanner against the repository you choose.</p>
            <Link className="button button--secondary" href="/studio/connect">Start story capture</Link>
          </div>
        </div>
      )}
    </section>
  );
}
