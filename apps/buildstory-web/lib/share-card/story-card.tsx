import { SHARE_CARD_PALETTE as P } from "./palette";
import type { ShareCardData } from "./format";

const SANS = "Geist, sans-serif";
const MONO = "Geist Mono, monospace";

function checkSealDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="none" stroke="${color}" stroke-width="2"/><path d="M12 20.5l5.5 5.5L28 14" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function Kicker({ handle }: { handle: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: MONO,
        fontSize: 20,
        color: P.coral,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      {`Buildstory  //  @${handle}`}
    </div>
  );
}

function StatBlock({ value, label, size = 40 }: { value: string; label: string; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: size, color: P.ink }}>{value}</div>
      <div
        style={{
          display: "flex",
          fontFamily: MONO,
          fontSize: 15,
          color: P.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ModelShareBar({ models }: { models: ShareCardData["models"] }) {
  const barColors = [P.coral, P.cobalt, P.muted];
  const withShare = models.filter((model) => model.share != null && model.share > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          fontFamily: MONO,
          fontSize: 14,
          color: P.faint,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Model mix
      </div>
      {withShare.length ? (
        <div style={{ display: "flex", width: "100%", height: 10, borderRadius: 5, overflow: "hidden" }}>
          {withShare.map((model, index) => (
            <div
              key={model.id}
              style={{ display: "flex", width: `${model.share}%`, height: "100%", backgroundColor: barColors[index % barColors.length] }}
            />
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {models.map((model, index) => (
          <div key={model.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                display: "flex",
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: model.share != null ? barColors[index % barColors.length] : P.faint,
              }}
            />
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 16, color: P.muted }}>
              {model.label}
              {model.share != null ? ` ${model.share}%` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Landscape 1200x630 - the pasted-link embed (OG / Twitter card). */
export function buildStoryOgCard(data: ShareCardData) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px",
        backgroundColor: P.surface,
        color: P.ink,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Kicker handle={data.handle} />
        <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 56, marginTop: 18, maxWidth: 980, lineHeight: 1.1 }}>
          {data.name}
        </div>
        {data.tagline ? (
          <div style={{ display: "flex", fontFamily: SANS, fontSize: 28, color: P.muted, marginTop: 16, maxWidth: 980 }}>
            {data.tagline}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {data.archetype || data.models.length ? (
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {data.archetype ? (
              <div style={{ display: "flex", padding: "8px 16px", border: `1px solid ${P.coral}`, color: P.coral, fontFamily: MONO, fontSize: 18 }}>
                {data.archetype}
              </div>
            ) : null}
            {data.models.map((model) => (
              <div key={model.id} style={{ display: "flex", padding: "8px 16px", border: `1px solid ${P.muted}`, color: P.muted, fontFamily: MONO, fontSize: 18 }}>
                {model.label}
              </div>
            ))}
          </div>
        ) : null}
        {data.stats.length ? (
          <div style={{ display: "flex", gap: 56 }}>
            {data.stats.map((stat) => (
              <StatBlock key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Portrait 1080x1350 - the downloadable image, built for a native Reddit/X image post. */
export function buildStoryShareCard(data: ShareCardData, canonicalUrl: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px",
        backgroundColor: P.surface,
        color: P.ink,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Kicker handle={data.handle} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={checkSealDataUri(P.coral)} width={40} height={40} alt="" />
          </div>
          <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 68, lineHeight: 1.08 }}>{data.name}</div>
          {data.tagline ? (
            <div style={{ display: "flex", fontFamily: SANS, fontSize: 30, color: P.muted, lineHeight: 1.35 }}>{data.tagline}</div>
          ) : null}
          {data.archetype ? (
            <div style={{ display: "flex", padding: "9px 18px", border: `1px solid ${P.coral}`, color: P.coral, fontFamily: MONO, fontSize: 18, alignSelf: "flex-start" }}>
              {data.archetype}
            </div>
          ) : null}
        </div>

        {data.stats.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
            {data.stats.map((stat) => (
              <div key={stat.label} style={{ display: "flex", width: data.stats.length > 2 ? "40%" : "auto" }}>
                <StatBlock value={stat.value} label={stat.label} size={48} />
              </div>
            ))}
          </div>
        ) : null}

        {data.models.length ? <ModelShareBar models={data.models} /> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", height: 0, borderTop: `1px dashed ${P.line}` }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 16, color: P.faint }}>{canonicalUrl}</div>
          <div style={{ display: "flex", fontFamily: SANS, fontSize: 16, color: P.faint }}>Every build has a story.</div>
        </div>
      </div>
    </div>
  );
}
