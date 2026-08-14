import Link from "next/link";
import { GithubStarButton } from "@/components/github-star-button";
import { BrandMark } from "./shell/brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <BrandMark className="wordmark--footer" />
        <p>Software is more interesting with the decisions left in.</p>
        <div className="site-footer__links">
          <Link href="/explore">Explore</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/u/arjun-mishra/vibe-social">Example story</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="mailto:arjunmishra31204@gmail.com">Say hello</a>
          <GithubStarButton compact />
        </div>
      </div>
    </footer>
  );
}
