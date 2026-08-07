import { getProfileByHandle } from "@/lib/social/store";
import { SHARE_CARD_PALETTE } from "@/lib/share-card/palette";
import { renderShareCard } from "@/lib/share-card/render";

type RouteContext = { params: Promise<{ handle: string }> };

const SANS = "Geist, sans-serif";
const MONO = "Geist Mono, monospace";

function fallbackCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        backgroundColor: SHARE_CARD_PALETTE.surface,
        color: SHARE_CARD_PALETTE.ink,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>Buildstory</div>
      <div style={{ display: "flex", fontSize: 26, color: SHARE_CARD_PALETTE.muted, marginTop: 12 }}>Every build has a story.</div>
    </div>
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { handle } = await context.params;
  const profile = await getProfileByHandle(handle).catch(() => null);

  if (!profile) {
    return renderShareCard(fallbackCard(), {
      width: 1200,
      height: 630,
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const image = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: "72px",
        backgroundColor: SHARE_CARD_PALETTE.surface,
        color: SHARE_CARD_PALETTE.ink,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", fontFamily: MONO, fontSize: 22, color: SHARE_CARD_PALETTE.coral, letterSpacing: 2, textTransform: "uppercase" }}>
        Buildstory Builder Profile
      </div>
      <div style={{ display: "flex", fontWeight: 700, fontSize: 62, marginTop: 20 }}>{profile.displayName}</div>
      <div style={{ display: "flex", fontFamily: MONO, fontSize: 28, color: SHARE_CARD_PALETTE.muted, marginTop: 8 }}>{`@${profile.handle}`}</div>
      {profile.bio ? (
        <div style={{ display: "flex", fontSize: 24, color: SHARE_CARD_PALETTE.muted, marginTop: 24, maxWidth: 920 }}>{profile.bio}</div>
      ) : null}
      <div style={{ display: "flex", gap: 56, marginTop: 48 }}>
        {[
          [String(profile.storyCount), "stories"],
          [String(profile.followerCount), "followers"],
          [String(profile.followingCount), "following"],
        ].map(([value, label]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: 40 }}>{value}</div>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, color: SHARE_CARD_PALETTE.muted, textTransform: "uppercase", letterSpacing: 1 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return renderShareCard(image, {
    width: 1200,
    height: 630,
    headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
