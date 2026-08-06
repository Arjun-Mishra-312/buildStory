import Link from "next/link";
import { BrandMark } from "./shell/brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <BrandMark className="wordmark--footer" />
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
