import type { Metadata } from "next";
import { ProjectWorkbench } from "@/components/project-workbench";
import { SiteHeader } from "@/components/site-header";
import { publicBuildStoryFromSnapshot } from "@/lib/build-story";
import { orbitNotesSnapshot } from "@/lib/mock-projects";

export const metadata: Metadata = {
  title: "Orbit Notes — Build Story",
  description:
    "The decisions, turning points, and AI build receipt behind Orbit Notes.",
};

export default function OrbitNotesPage() {
  const story = publicBuildStoryFromSnapshot(orbitNotesSnapshot, [
    "tagline",
    "description",
    "timeWindow",
    "sessionSummary",
    "milestones",
    "modelMix",
    "gitAggregates",
    "redactionSummary",
  ]);

  return (
    <div className="page-shell page-shell--project">
      <SiteHeader active="project" compact />
      <ProjectWorkbench story={story} access="public" />
    </div>
  );
}
