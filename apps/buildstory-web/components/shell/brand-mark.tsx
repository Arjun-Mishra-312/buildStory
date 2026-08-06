import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link className={`wordmark ${className}`.trim()} href="/" aria-label="Buildstory home">
      <span className="wordmark__mark" aria-hidden="true"><span /><span /></span>
      <span>Buildstory</span>
    </Link>
  );
}
