import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { getPublishedStory } from "@/lib/ingestion/store";

type PageProps = { params: Promise<{ handle: string; slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, slug } = await params;
  const story = await getPublishedStory(handle, slug).catch(() => null);
  return { title: story ? `${story.name} — Build Story` : "Build Story not found", description: story?.tagline };
}

export default async function PublishedStoryPage({ params }: PageProps) {
  const { handle, slug } = await params;
  let story;
  try {
    story = await getPublishedStory(handle, slug);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 503) {
      return <section className="unavailable-state section-wrap"><span className="section-index">( TEMPORARILY UNAVAILABLE )</span><h1>The public trail is taking a short pause.</h1><p>Try again in a moment.</p></section>;
    }
    throw error;
  }
  if (!story) notFound();
  return <ProjectWorkbench story={story} access="public" />;
}
