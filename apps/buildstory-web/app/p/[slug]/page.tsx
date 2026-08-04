import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedStoryBySlug } from "@/lib/ingestion/store";

type PageProps = { params: Promise<{ slug: string }> };

/** Distinguishes "the durable store is unreachable" from "no story here." */
function isDependencyUnavailable(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "isBuildstoryIngestionError" in error &&
    "status" in error &&
    (error as { status: unknown }).status === 503
  );
}

async function loadStory(slug: string) {
  try {
    return { story: await getPublishedStoryBySlug(slug), unavailable: false };
  } catch (error) {
    if (isDependencyUnavailable(error)) return { story: null, unavailable: true };
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { story } = await loadStory(slug);
  if (!story) return { title: "Build Story not found" };
  return {
    title: `${story.name} — Build Story`,
    description: story.tagline,
  };
}

export default async function PublishedBuildStoryPage({ params }: PageProps) {
  const { slug } = await params;
  const { story, unavailable } = await loadStory(slug);

  if (unavailable) {
    return (
      <div className="page-shell page-shell--project">
        <SiteHeader active="project" compact />
        <main className="creator-page creator-project-empty">
          <span className="section-index">( TEMPORARILY UNAVAILABLE )</span>
          <h1>This build story can’t load right now.</h1>
          <p>The durable store is unreachable. Try again shortly.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }
  if (!story) notFound();

  return (
    <div className="page-shell page-shell--project">
      <SiteHeader active="project" compact />
      <ProjectWorkbench story={story} access="public" />
    </div>
  );
}
