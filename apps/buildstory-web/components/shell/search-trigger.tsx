"use client";

import Link from "next/link";

export function SearchTrigger() {
  return <Link className="search-trigger" href="/search" aria-label="Search stories"><span aria-hidden="true">⌕</span><span>Search</span></Link>;
}
