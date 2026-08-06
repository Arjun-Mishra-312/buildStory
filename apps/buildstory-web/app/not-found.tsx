import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found-state section-wrap">
        <span className="section-index">( 404 / UNMAPPED TRAIL )</span>
        <h1>We couldn&apos;t find that build story.</h1>
        <p>The page may have moved, stayed private, or never existed.</p>
        <Link className="button button--primary" href="/explore">Explore public stories</Link>
    </section>
  );
}
