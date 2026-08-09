"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return <Link href={href} onClick={onClick} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{children}</Link>;
}
