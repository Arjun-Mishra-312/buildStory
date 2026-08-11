import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectStoryViewer } from "@/components/story/project-story-viewer";
import { getPublishedStory } from "@/lib/ingestion/store";
import { manifestForPublishedStory, type PublishedStoryWithManifest } from "@/lib/story/project-story";

type PageProps = { params: Promise<{ handle: string; slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, slug } = await params;
  const story = await getPublishedStory(handle, slug).catch(() => null);
  const title = story ? `${story.name} · Project Story` : "Project Story not found";
  const description = story?.tagline || "A shareable story from a private Buildstory report.";
  return { title, description, openGraph: { type: "article", title, description } };
}

export default async function ProjectStoryPage({ params }: PageProps) {
  const { handle, slug } = await params;
  const story = await getPublishedStory(handle, slug).catch(() => null);
  if (!story) notFound();
  const reportPath = `/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  const manifest = manifestForPublishedStory(story as PublishedStoryWithManifest, reportPath);
  return <ProjectStoryViewer manifest={manifest} downloadPath={`/api/share/story/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`} />;
}
