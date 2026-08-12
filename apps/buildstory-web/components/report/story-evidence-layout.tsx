import type { ReactNode } from "react";
import type { ReportSurface } from "@/lib/report/evidence-view-model";

export function StoryEvidenceLayout({
  surface,
  story,
  evidence,
  className = "",
}: {
  surface: ReportSurface;
  story: ReactNode;
  evidence: ReactNode;
  className?: string;
}) {
  return (
    <div className={`story-evidence-layout story-evidence-layout--${surface} ${className}`.trim()}>
      <div className="story-evidence-layout__story" aria-label="The story">
        <div className="story-evidence-layout__lane-heading">
          <span>THE STORY</span>
          <small>Model-written narrative and editorial context</small>
        </div>
        {story}
      </div>
      <aside className="story-evidence-layout__evidence" aria-label="The evidence">
        {evidence}
      </aside>
    </div>
  );
}
