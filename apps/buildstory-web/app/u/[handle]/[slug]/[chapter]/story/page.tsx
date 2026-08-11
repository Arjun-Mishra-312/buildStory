import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectStoryViewer } from "@/components/story/project-story-viewer";
import { getPublishedStoryChapter, listPublishedChapters } from "@/lib/ingestion/store";
import { manifestForPublishedStory, type PublishedStoryWithManifest } from "@/lib/story/project-story";

type PageProps = { params: Promise<{ handle: string; slug: string; chapter: string }> };
export const dynamic = "force-dynamic";

function parseChapter(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, slug, chapter } = await params;
  const chapterIndex = parseChapter(chapter);
  const story = chapterIndex ? await getPublishedStoryChapter(handle, slug, chapterIndex).catch(() => null) : null;
  const title = story ? `${story.name} · Chapter ${chapterIndex} Project Story` : "Project Story not found";
  const description = story?.tagline || "A shareable story from a private Buildstory report.";
  return { title, description, openGraph: { type: "article", title, description } };
}

export default async function ProjectStoryChapterPage({ params }: PageProps) {
  const { handle, slug, chapter } = await params;
  const chapterIndex = parseChapter(chapter);
  if (!chapterIndex) notFound();
  const chapters = await listPublishedChapters(handle, slug).catch(() => []);
  const latest = chapters.at(-1);
  if (latest?.chapterIndex === chapterIndex) redirect(`/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}/story`);
  const story = await getPublishedStoryChapter(handle, slug, chapterIndex).catch(() => null);
  if (!story) notFound();
  const reportPath = `/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}/${chapterIndex}`;
  const manifest = manifestForPublishedStory(story as PublishedStoryWithManifest, reportPath);
  return <ProjectStoryViewer manifest={manifest} downloadPath={`/api/share/story/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}?chapter=${chapterIndex}`} />;
}
