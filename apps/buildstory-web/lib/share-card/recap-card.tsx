import { recapShowsArt, type RecapSlide, type RecapSlideKind } from "@/lib/report/recap";
import type { RecapBar, RecapRankedItem, RecapStatTile, RecapWidget } from "@/lib/report/recap-widgets";
import { formatSignalUnit, formatSignalValue, kickerForFamily } from "@/lib/report/poster-art";
import type { Signal } from "@/lib/ingestion/scanner-project-snapshot";
import type { ReactNode } from "react";

const SANS = "Geist, sans-serif";
const MONO = "Geist Mono, monospace";

const KIND_THEME: Record<RecapSlideKind, { background: string; ink: string; muted: string; accent: string; line: string; glass: string }> = {
  title: { background: "#f4efe4", ink: "#191a17", muted: "#5c574c", accent: "#2447d8", line: "#c9c2b3", glass: "rgba(25, 26, 23, 0.08)" },
  scale: { background: "#2447d8", ink: "#faf7ef", muted: "#c9d2f5", accent: "#faf7ef", line: "#6f86e8", glass: "rgba(250, 247, 239, 0.14)" },
  signature: { background: "#f36f56", ink: "#191a17", muted: "#5c2e24", accent: "#191a17", line: "#c45a46", glass: "rgba(25, 26, 23, 0.1)" },
  turning: { background: "#d59a3e", ink: "#191a17", muted: "#5c4a22", accent: "#191a17", line: "#b07e2e", glass: "rgba(25, 26, 23, 0.1)" },
  receipt: { background: "#f4efe4", ink: "#191a17", muted: "#5c574c", accent: "#2447d8", line: "#c9c2b3", glass: "rgba(25, 26, 23, 0.08)" },
  close: { background: "#2f7250", ink: "#faf7ef", muted: "#c5dccb", accent: "#faf7ef", line: "#4a8a66", glass: "rgba(250, 247, 239, 0.14)" },
};

function Glass({ children, theme, pad = 18 }: { children: ReactNode; theme: (typeof KIND_THEME)[RecapSlideKind]; pad?: number }) {
  return (
    <div style={{ display: "flex", backgroundColor: theme.glass, borderRadius: 20, padding: pad }}>
      {children}
    </div>
  );
}

function StatGridCard({ tiles, theme }: { tiles: RecapStatTile[]; theme: (typeof KIND_THEME)[RecapSlideKind] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {tiles.map((tile) => (
        <Glass key={tile.label} theme={theme} pad={20}>
          <div style={{ display: "flex", flexDirection: "column", width: 200, gap: 6 }}>
            <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: 40 }}>{tile.value}</div>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", color: theme.muted }}>{tile.label}</div>
          </div>
        </Glass>
      ))}
    </div>
  );
}

function BarsCard({ bars, theme }: { bars: RecapBar[]; theme: (typeof KIND_THEME)[RecapSlideKind] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      {bars.map((bar) => (
        <div key={bar.key} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", width: 48, fontFamily: MONO, fontSize: 18 }}>{bar.label}</div>
          <div style={{ display: "flex", flexGrow: 1, height: 14, borderRadius: 99, backgroundColor: theme.glass, overflow: "hidden" }}>
            <div style={{ display: "flex", width: `${bar.share * 100}%`, height: "100%", backgroundColor: theme.ink }} />
          </div>
          <div style={{ display: "flex", width: 56, justifyContent: "flex-end", fontFamily: MONO, fontSize: 18, color: theme.muted }}>{bar.count || ""}</div>
        </div>
      ))}
    </div>
  );
}

function RankedCard({ items, theme }: { items: RecapRankedItem[]; theme: (typeof KIND_THEME)[RecapSlideKind] }) {
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <Glass theme={theme} pad={24}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, letterSpacing: 3, textTransform: "uppercase", color: theme.muted }}>{`#${lead.rank}`}</div>
          <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 44 }}>{lead.title}</div>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 20, color: theme.muted }}>{lead.subtitle}</div>
        </div>
      </Glass>
      {rest.map((item) => (
        <div key={item.rank} style={{ display: "flex", justifyContent: "space-between", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 28, opacity: 0.4 }}>{item.rank}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 28 }}>{item.title}</div>
              <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, color: theme.muted }}>{item.subtitle}</div>
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 24 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function StreakCard({ widget, theme }: { widget: Extract<RecapWidget, { type: "streak" }>; theme: (typeof KIND_THEME)[RecapSlideKind] }) {
  if (!widget.others.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      {widget.others.map((item) => (
        <Glass key={`${item.start}-${item.end}`} theme={theme}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 16 }}>
            <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: 28 }}>{`${item.days} days`}</div>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 20, color: theme.muted }}>{item.label}</div>
          </div>
        </Glass>
      ))}
    </div>
  );
}

function WidgetBlock({ widget, theme }: { widget: RecapWidget; theme: (typeof KIND_THEME)[RecapSlideKind] }) {
  if (widget.type === "stat-grid") return <StatGridCard tiles={widget.tiles} theme={theme} />;
  if (widget.type === "ranked") return <RankedCard items={widget.items} theme={theme} />;
  if (widget.type === "hour-bars" || widget.type === "weekday") return <BarsCard bars={widget.bars} theme={theme} />;
  return <StreakCard widget={widget} theme={theme} />;
}

export type RecapShareCardOptions = {
  audience?: "creator" | "visitor";
  visualDataUri?: string | null;
};

export function buildRecapShareCard(
  slide: RecapSlide,
  projectName: string,
  handle: string,
  options: RecapShareCardOptions = {},
) {
  const theme = KIND_THEME[slide.kind] ?? KIND_THEME.title;
  const visitorClose = options.audience === "visitor" && slide.kind === "close";
  const kicker = visitorClose ? "Your turn" : slide.kicker;
  const headline = visitorClose ? "Every build has a story." : slide.headline;
  const body = visitorClose
    ? "This one was generated from AI coding sessions — privately, until the builder shared it."
    : slide.body;
  const hero = slide.giantValue ?? headline;
  const layout = slide.layout && slide.layout !== "copy" ? slide.layout : undefined;
  const supporting = [body, slide.beat !== "setup" && !layout ? slide.howWeKnow : undefined]
    .map((text) => text?.trim() ?? "")
    .filter((text, index, list) => text && text !== headline && list.indexOf(text) === index);
  const showArt = recapShowsArt(slide) && Boolean(options.visualDataUri);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 56px 52px",
        backgroundColor: theme.background,
        color: theme.ink,
        fontFamily: SANS,
      }}
    >
      {showArt ? (
        <div style={{ display: "flex", position: "absolute", right: 54, bottom: 132, width: 390, height: 390, borderRadius: 28, overflow: "hidden", opacity: 0.55 }}>
          {/* The browser recap shows this same slide illustration as a lower-right watermark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={options.visualDataUri ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, color: theme.accent, letterSpacing: 3, textTransform: "uppercase" }}>
          {`Buildstory  //  @${handle}`}
        </div>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 22, color: theme.muted, letterSpacing: 3, textTransform: "uppercase" }}>
          {kicker}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 22, padding: "36px 0" }}>
        <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: slide.giantValue ? 140 : 72, lineHeight: 0.84, letterSpacing: -4, color: theme.accent }}>
          {hero}
        </div>
        {slide.giantLabel ? (
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 3 }}>
            {slide.giantLabel}
          </div>
        ) : null}
        {slide.widget ? <WidgetBlock widget={slide.widget} theme={theme} /> : null}
        {slide.giantValue ? (
          <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 40, lineHeight: 1.08 }}>
            {headline}
          </div>
        ) : null}
        {supporting.map((text) => (
          <div key={text} style={{ display: "flex", fontFamily: SANS, fontSize: 28, color: theme.muted, lineHeight: 1.35, maxWidth: 900 }}>
            {text}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", height: 0, borderTop: `1px dashed ${theme.line}` }} />
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, color: theme.muted }}>{projectName}</div>
        <div style={{ display: "flex", fontFamily: SANS, fontSize: 16, color: theme.muted }}>Every build has a story.</div>
      </div>
    </div>
  );
}

const FAMILY_THEME: Record<Signal["family"], { background: string; ink: string; muted: string; accent: string }> = {
  rhythm: { background: "#f36f56", ink: "#191a17", muted: "#5c2e24", accent: "#191a17" },
  tooling: { background: "#2447d8", ink: "#faf7ef", muted: "#c9d2f5", accent: "#faf7ef" },
  conversation: { background: "#2a3370", ink: "#faf7ef", muted: "#c9d2f5", accent: "#faf7ef" },
  spend: { background: "#d59a3e", ink: "#191a17", muted: "#5c4a22", accent: "#191a17" },
  output: { background: "#2f7250", ink: "#faf7ef", muted: "#c5dccb", accent: "#faf7ef" },
  evidence: { background: "#dce3ff", ink: "#191a17", muted: "#4c5680", accent: "#191a17" },
};

/** Export renderer for the standalone WowFactPoster cards in the report. */
export function buildSignalShareCard(signal: Signal, handle: string, visualDataUri?: string | null) {
  const theme = FAMILY_THEME[signal.family];
  const unit = formatSignalUnit(signal);
  return (
    <div style={{ display: "flex", position: "relative", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "64px 56px 52px", backgroundColor: theme.background, color: theme.ink, fontFamily: SANS }}>
      <div style={{ display: "flex", fontFamily: MONO, fontSize: 20, color: theme.accent, letterSpacing: 3, textTransform: "uppercase" }}>{`Buildstory  //  @${handle}`}</div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 22, padding: "36px 0" }}>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 22, color: theme.muted, letterSpacing: 3, textTransform: "uppercase" }}>{kickerForFamily(signal.family)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
          <div style={{ display: "flex", fontFamily: MONO, fontWeight: 700, fontSize: 126, lineHeight: 0.86, letterSpacing: -5 }}>{formatSignalValue(signal)}</div>
          {unit ? <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 3 }}>{unit}</div> : null}
          <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 40, lineHeight: 1.08, marginTop: 16 }}>{signal.headline}</div>
          <div style={{ display: "flex", fontFamily: SANS, fontSize: 27, color: theme.muted, lineHeight: 1.35, marginTop: 6 }}>{signal.detail}</div>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 17, color: theme.muted, marginTop: 18 }}>How we know</div>
        </div>
        {visualDataUri ? (
          <div style={{ display: "flex", position: "absolute", right: 54, bottom: 160, width: 330, height: 330, borderRadius: 28, overflow: "hidden", opacity: 0.42 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visualDataUri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", height: 0, borderTop: `1px dashed ${theme.muted}` }} />
        <div style={{ display: "flex", fontFamily: SANS, fontSize: 18, color: theme.muted }}>Straight from the build</div>
      </div>
    </div>
  );
}
