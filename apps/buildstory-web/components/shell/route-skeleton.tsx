import { ReceiptLoader } from "./receipt-loader";

export type RouteSkeletonVariant = "generic" | "explore" | "profile" | "story" | "studio" | "editor" | "settings" | "connect";

function Blocks({ count, className = "" }: { count: number; className?: string }) {
  return <div className={`route-skeleton__blocks ${className}`}>{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

export function RouteSkeleton({ variant = "generic", label = "Loading" }: { variant?: RouteSkeletonVariant; label?: string }) {
  return (
    <section className={`route-skeleton route-skeleton--${variant}`} aria-busy="true" aria-label={label}>
      <ReceiptLoader label={label} />
      <div className="route-skeleton__canvas" aria-hidden="true">
        {variant === "explore" ? <><i className="route-skeleton__toolbar" /><div className="route-skeleton__explore"><Blocks count={7} className="route-skeleton__rail" /><Blocks count={4} className="route-skeleton__story-list" /></div></> : null}
        {variant === "profile" ? <><div className="route-skeleton__profile"><i /><Blocks count={4} /></div><Blocks count={3} className="route-skeleton__story-list" /></> : null}
        {variant === "story" ? <><div className="route-skeleton__hero"><Blocks count={5} /><i /></div><Blocks count={5} className="route-skeleton__metrics" /><Blocks count={3} className="route-skeleton__story-body" /></> : null}
        {variant === "studio" ? <><Blocks count={3} className="route-skeleton__heading" /><Blocks count={3} className="route-skeleton__dashboard" /></> : null}
        {variant === "editor" ? <><i className="route-skeleton__toolbar" /><div className="route-skeleton__editor"><Blocks count={6} /><Blocks count={4} /></div></> : null}
        {variant === "settings" ? <><Blocks count={3} className="route-skeleton__heading" /><Blocks count={4} className="route-skeleton__settings" /></> : null}
        {variant === "connect" ? <><Blocks count={3} className="route-skeleton__heading" /><div className="route-skeleton__connect"><Blocks count={3} /><Blocks count={6} /></div></> : null}
        {variant === "generic" ? <><Blocks count={3} className="route-skeleton__heading" /><Blocks count={3} className="route-skeleton__story-list" /></> : null}
      </div>
    </section>
  );
}
