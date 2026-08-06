import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "./top-bar";
import type { Viewer } from "./viewer";

export function AppShell({ viewer, children }: { viewer: Viewer | null; children: React.ReactNode }) {
  return (
    <div className="page-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <TopBar viewer={viewer} />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter />
    </div>
  );
}
