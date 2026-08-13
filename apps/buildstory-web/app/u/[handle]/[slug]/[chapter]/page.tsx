import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { getPublicProjectVerification, getPublishedStoryChapter, listPublishedChapters, countPublicArchetypes } from "@/lib/ingestion/store";
import { getProfileByHandle } from "@/lib/social/store";
import { builderRoleLabel } from "@/lib/identity/builder-roles";

type PageProps = { params: Promise<{ handle: string; slug: string; chapter: string }> };
export const dynamic = "force-dynamic";

function parseChapter(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, slug, chapter } = await params;
  const chapterIndex = parseChapter(chapter);
  if (!chapterIndex) return { title: "Build Story not found" };
  const story = await getPublishedStoryChapter(handle, slug, chapterIndex).catch(() => null);
  const title = story ? `${story.name} — Chapter ${chapterIndex}` : "Build Story not found";
  const description = story?.tagline;
  const ogImage = `/api/og/story/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function PublishedStoryChapterPage({ params }: PageProps) {
  const { handle, slug, chapter } = await params;
  const chapterIndex = parseChapter(chapter);
  if (!chapterIndex) notFound();

  const chapters = await listPublishedChapters(handle, slug).catch(() => []);
  const latest = chapters.at(-1);
  // The latest chapter is already served at the canonical /u/handle/slug path -
  // redirect there instead of serving duplicate content at two URLs.
  if (latest && latest.chapterIndex === chapterIndex) {
    redirect(`/u/${handle}/${slug}`);
  }

  let story;
  try {
    story = await getPublishedStoryChapter(handle, slug, chapterIndex);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 503) {
      return <section className="unavailable-state section-wrap"><span className="section-index">( TEMPORARILY UNAVAILABLE )</span><h1>The public trail is taking a short pause.</h1><p>Try again in a moment.</p></section>;
    }
    throw error;
  }
  if (!story) notFound();
  const verifiedRepoAt = await getPublicProjectVerification(handle, slug).catch(() => null);
  const profile = await getProfileByHandle(handle).catch(() => null);
  const archetypeCounts = await countPublicArchetypes().catch(() => ({ total: 0, byKey: {} }));
  return (
    <ProjectWorkbench
      story={story}
      access="public"
      chapters={chapters}
      currentChapterIndex={chapterIndex}
      initialVerifiedRepoAt={verifiedRepoAt}
      ownerRoleOverride={profile?.builderRole ? builderRoleLabel(profile.builderRole) : null}
      archetypeCounts={archetypeCounts}
    />
  );
}
