import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { SiteHeader } from "@/components/site-header";
import { getPublishedStoryBySlug } from "@/lib/ingestion/store";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = await getPublishedStoryBySlug(slug);
  if (!story) return { title: "Build Story not found" };
  return {
    title: `${story.name} — Build Story`,
    description: story.tagline,
  };
}

export default async function PublishedBuildStoryPage({ params }: PageProps) {
  const { slug } = await params;
  const story = await getPublishedStoryBySlug(slug);
  if (!story) notFound();

  return (
    <div className="page-shell page-shell--project">
      <SiteHeader active="project" compact />
      <ProjectWorkbench story={story} access="public" />
    </div>
  );
}
