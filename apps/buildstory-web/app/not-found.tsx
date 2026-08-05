import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="not-found-state section-wrap">
        <span className="section-index">( 404 / UNMAPPED TRAIL )</span>
        <h1>We couldn&apos;t find that build story.</h1>
        <p>The page may have moved, stayed private, or never existed.</p>
        <Link className="button button--primary" href="/explore">Explore public stories</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
