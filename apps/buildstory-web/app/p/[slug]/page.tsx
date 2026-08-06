import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getPublishedStoryBySlug } from "@/lib/ingestion/store";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = await getPublishedStoryBySlug(slug).catch(() => null);
  return { title: story ? `${story.name} — Build Story` : "Build Story not found", description: story?.tagline };
}

export default async function LegacyStoryPage({ params }: PageProps) {
  const { slug } = await params;
  try {
    const story = await getPublishedStoryBySlug(slug);
    if (story) permanentRedirect(`/u/${story.owner.handle}/${story.slug}`);
  } catch (error) {
    if (!(error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 503)) throw error;
    return <section className="creator-page creator-project-empty"><span className="section-index">( TEMPORARILY UNAVAILABLE )</span><h1>This build story can’t load right now.</h1><p>The durable store is unreachable. Try again shortly.</p></section>;
  }
  return null;
}
