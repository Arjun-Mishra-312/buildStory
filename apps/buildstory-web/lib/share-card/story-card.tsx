import { SHARE_CARD_LIGHT_PALETTE, SHARE_CARD_PALETTE as DARK_P } from "./palette";
import type { BackgroundTheme } from "@/lib/background-options";
import type { ShareCardData } from "./format";

const SANS = "Geist, sans-serif";
const MONO = "Geist Mono, monospace";
const P = DARK_P;

function paletteForTheme(theme: BackgroundTheme): CardPalette {
  return theme === "light" ? SHARE_CARD_LIGHT_PALETTE : DARK_P;
}

function checkSealDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="none" stroke="${color}" stroke-width="2"/><path d="M12 20.5l5.5 5.5L28 14" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type CardPalette = { [Key in keyof typeof DARK_P]: string };

function Kicker({ handle, palette = DARK_P }: { handle: string; palette?: CardPalette }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: MONO,
        fontSize: 20,
        color: palette.coral,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      {`Buildstory  //  @${handle}`}
    </div>
  );
}

function StatBlock({ value, label, size = 40, palette = DARK_P }: { value: string; label: string; size?: number; palette?: CardPalette }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: size, color: palette.ink }}>{value}</div>
      <div
        style={{
          display: "flex",
          fontFamily: MONO,
          fontSize: 15,
          color: palette.muted,
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

function ModelShareBar({ models, palette = DARK_P }: { models: ShareCardData["models"]; palette?: CardPalette }) {
  const barColors = [palette.coral, palette.cobalt, palette.muted];
  const withShare = models.filter((model) => model.share != null && model.share > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          fontFamily: MONO,
          fontSize: 14,
          color: palette.faint,
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
                backgroundColor: model.share != null ? barColors[index % barColors.length] : palette.faint,
              }}
            />
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 16, color: palette.muted }}>
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
export function buildStoryShareCard(
  data: ShareCardData,
  canonicalUrl: string,
  options: { backgroundDataUri?: string | null; theme?: BackgroundTheme } = {},
) {
  const palette = paletteForTheme(options.theme ?? "dark");
  const panel = options.theme === "light" ? "#f1ede3" : "#191a17";
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: palette.surface,
        color: palette.ink,
        fontFamily: SANS,
      }}
    >
      {options.backgroundDataUri ? (
        // The artwork is deliberately isolated behind the copy panel. No text
        // is painted on top of a decorative image element.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={options.backgroundDataUri} alt="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: "70%", height: "100%", backgroundColor: panel }} />
      <div style={{ display: "flex", position: "relative", flexDirection: "column", justifyContent: "space-between", width: "70%", height: "100%", padding: "72px 54px 58px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Kicker handle={data.handle} palette={palette} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={checkSealDataUri(palette.coral)} width={40} height={40} alt="" />
            </div>
            <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{data.name}</div>
            {data.tagline ? (
              <div style={{ display: "flex", fontFamily: SANS, fontSize: 30, color: palette.muted, lineHeight: 1.35 }}>{data.tagline}</div>
            ) : null}
            {data.archetype ? (
              <div style={{ display: "flex", padding: "9px 18px", border: `1px solid ${palette.coral}`, color: palette.coral, fontFamily: MONO, fontSize: 18, alignSelf: "flex-start" }}>
                {data.archetype}
              </div>
            ) : null}
          </div>

          {data.stats.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
              {data.stats.map((stat) => (
                <div key={stat.label} style={{ display: "flex", width: data.stats.length > 2 ? "40%" : "auto" }}>
                  <StatBlock value={stat.value} label={stat.label} size={48} palette={palette} />
                </div>
              ))}
            </div>
          ) : null}

          {data.models.length ? <ModelShareBar models={data.models} palette={palette} /> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", height: 0, borderTop: `1px dashed ${palette.line}` }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 16, color: palette.faint }}>{canonicalUrl}</div>
            <div style={{ display: "flex", fontFamily: SANS, fontSize: 16, color: palette.faint }}>Every build has a story.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
