import type { Metadata } from "next";
import { ExploreFeed } from "@/components/explore-feed";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { exploreProjects } from "@/lib/mock-projects";

export const metadata: Metadata = {
  title: "Explore build stories",
  description:
    "Discover the process, turning points, and AI build receipts behind software made by independent builders.",
};

export default function ExplorePage() {
  return (
    <div className="page-shell">
      <SiteHeader active="explore" />
      <main className="explore-page section-wrap">
        <header className="explore-heading">
          <div>
            <span className="section-index">( EXPLORE / 05 STORIES )</span>
            <h1>What are people<br />actually building?</h1>
          </div>
          <p>
            Finished products, earnest experiments, and work in progress — with
            enough process left in to learn from.
          </p>
        </header>
        <ExploreFeed projects={exploreProjects} />
      </main>
      <SiteFooter />
    </div>
  );
}
