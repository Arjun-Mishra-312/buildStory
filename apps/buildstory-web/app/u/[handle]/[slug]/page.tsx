import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { getPublicProjectVerification, getPublishedStory, listPublishedChapters } from "@/lib/ingestion/store";

type PageProps = { params: Promise<{ handle: string; slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, slug } = await params;
  const story = await getPublishedStory(handle, slug).catch(() => null);
  const title = story ? `${story.name} — Build Story` : "Build Story not found";
  const description = story?.tagline;
  const ogImage = `/api/og/story/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  const pageUrl = `/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  const imageAlt = story ? `${story.name} — Build Story` : "Buildstory — Every build has a story.";
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url: pageUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
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
  const chapters = await listPublishedChapters(handle, slug).catch(() => []);
  const currentChapterIndex = chapters.at(-1)?.chapterIndex ?? 1;
  const verifiedRepoAt = await getPublicProjectVerification(handle, slug).catch(() => null);
  return (
    <ProjectWorkbench
      story={story}
      access="public"
      chapters={chapters}
      currentChapterIndex={currentChapterIndex}
      initialVerifiedRepoAt={verifiedRepoAt}
    />
  );
}
