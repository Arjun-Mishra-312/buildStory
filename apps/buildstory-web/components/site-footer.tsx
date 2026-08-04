import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Link className="wordmark wordmark--footer" href="/">
          <span className="wordmark__mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Buildstory</span>
        </Link>
        <p>Software is more interesting with the decisions left in.</p>
        <div className="site-footer__links">
          <Link href="/explore">Explore</Link>
          <Link href="/p/orbit-notes">Example story</Link>
          <a href="mailto:hello@buildstory.community">Say hello</a>
        </div>
      </div>
    </footer>
  );
}
