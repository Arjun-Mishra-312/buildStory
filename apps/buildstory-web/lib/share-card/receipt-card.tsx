import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { receiptFilesTouchedNote } from "@/lib/report/public-brief";

/** The fields that the on-screen ReceiptCard exposes. */
export type ReceiptShareStory = Pick<
  PublicBuildStoryViewModel,
  | "name"
  | "receiptId"
  | "dateRange"
  | "buildHours"
  | "sessionCount"
  | "subagentCount"
  | "models"
  | "git"
  | "modelRequests"
  | "redaction"
  | "cost"
  | "coverage"
>;

const PAPER = "#faf7ef";
const INK = "#191a17";
const MUTED = "#6d6a60";
const CORAL = "#f36f56";
const LINE = "#c9c4b8";
const GREEN = "#2f7250";

const usdFormat = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function checkSealDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="none" stroke="${color}" stroke-width="2"/><path d="M14 24.5l6.5 6.5L34 17" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatMicroUsd(microUsd: number): string {
  return usdFormat.format(microUsd / 1_000_000);
}

function ReceiptRule({ dashed = false }: { dashed?: boolean }) {
  return <div style={{ display: "flex", height: 0, borderTop: `1px ${dashed ? "dashed" : "solid"} ${LINE}` }} />;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "7px 0" }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 18, color: MUTED }}>{label}</div>
      <div style={{ display: "flex", maxWidth: 600, textAlign: "right", fontFamily: "Geist Mono, monospace", fontSize: 18 }}>{value}</div>
    </div>
  );
}

function ReceiptMetric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontWeight: 700, fontSize: 34 }}>{value}</div>
      <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 14, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

/**
 * Export renderer for the receipt shown by ReceiptCard.
 *
 * The recap receipt slide is a real ReceiptCard in the browser. It must not
 * fall through to the generic recap-card renderer, which only knows how to
 * draw a headline and would silently turn the receipt into a different card.
 */
export function buildReceiptShareCard(story: ReceiptShareStory) {
  const coverageNotes: string[] = [];
  if (story.coverage && story.coverage.sessionsSkipped > 0) {
    const n = story.coverage.sessionsSkipped;
    coverageNotes.push(`${n.toLocaleString()} session${n === 1 ? "" : "s"} outside the selected window ${n === 1 ? "isn't" : "aren't"} reflected in these totals.`);
  }
  if (story.coverage && story.coverage.partiallyPricedModels > 0) {
    const n = story.coverage.partiallyPricedModels;
    coverageNotes.push(`${n.toLocaleString()} model${n === 1 ? "" : "s"} priced only part of its observed usage.`);
  }
  const filesNote = receiptFilesTouchedNote(story.git.filesTouched);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 34, backgroundColor: "#252620", color: INK, fontFamily: "Geist, sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "42px 44px 34px", backgroundColor: PAPER, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 17, color: CORAL, letterSpacing: 3, textTransform: "uppercase" }}>AI Build Receipt</div>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 700, lineHeight: 1.05 }}>{story.name}</div>
          </div>
          {/* Keep the seal vector-based so it does not depend on a checkmark glyph in the downloaded font subset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={checkSealDataUri(CORAL)} width={48} height={48} alt="" />
        </div>

        <div style={{ display: "flex", margin: "26px 0 16px" }}><ReceiptRule /></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ReceiptRow label="Build ID" value={story.receiptId} />
          <ReceiptRow label="Window" value={story.dateRange} />
          <ReceiptRow label="Active build time" value={`${story.buildHours} hours`} />
          <ReceiptRow label="AI sessions" value={`${story.sessionCount} sessions${story.subagentCount > 0 ? ` · ${story.subagentCount} subagent runs` : ""}`} />
        </div>

        <div style={{ display: "flex", margin: "18px 0 20px" }}><ReceiptRule dashed /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontFamily: "Geist Mono, monospace", fontSize: 15, color: MUTED, textTransform: "uppercase", letterSpacing: 2 }}>Model mix</div>
          {story.models.map((model) => (
            <div key={model.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontFamily: "Geist Mono, monospace", fontSize: 17 }}>
                <div style={{ display: "flex" }}>{model.label}</div>
                <div style={{ display: "flex", color: MUTED }}>{model.share === null ? "unpriced" : `${model.share}%`}{model.costMicroUsd != null ? ` · ${formatMicroUsd(model.costMicroUsd)}` : ""}</div>
              </div>
              <div style={{ display: "flex", width: "100%", height: 9, borderRadius: 99, backgroundColor: "#dfdacf", overflow: "hidden" }}>
                <div style={{ display: "flex", width: `${model.share ?? 0}%`, height: "100%", backgroundColor: CORAL }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", margin: "22px 0 20px" }}><ReceiptRule dashed /></div>
        <div style={{ display: "flex", gap: 26 }}>
          <ReceiptMetric value={String(story.git.commits)} label="commits" />
          <ReceiptMetric value={String(story.git.filesTouched)} label="files touched" />
          <ReceiptMetric value={String(story.modelRequests)} label="model calls" />
          {story.cost?.totalMicroUsd != null ? <ReceiptMetric value={formatMicroUsd(story.cost.totalMicroUsd)} label="est. API-equivalent spend" /> : null}
        </div>

        <div style={{ display: "flex", marginTop: "auto", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: GREEN, fontFamily: "Geist Mono, monospace", fontSize: 16 }}>
            <span style={{ display: "flex", width: 8, height: 8, borderRadius: 999, backgroundColor: GREEN }} />
            <span style={{ display: "flex" }}>Redacted locally · {story.redaction.tokensRemoved.toLocaleString()} tokens withheld</span>
          </div>
          {story.cost && story.cost.unpricedTokens > 0 ? <div style={{ display: "flex", color: MUTED, fontSize: 14 }}>{story.cost.unpricedTokens.toLocaleString()} tokens from unpriced models are excluded from the cost-share denominator.</div> : null}
          {coverageNotes.length > 0 ? <div style={{ display: "flex", color: MUTED, fontSize: 14 }}>{coverageNotes.join(" ")}</div> : null}
          <div style={{ display: "flex", alignItems: "stretch", height: 28, gap: 4, margin: "4px 0" }}>
            {[3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1].map((width, index) => (
              <span key={index} style={{ display: "flex", width, height: "100%", backgroundColor: INK }} />
            ))}
          </div>
          <div style={{ display: "flex", color: MUTED, fontSize: 14, lineHeight: 1.35 }}>Rate-card estimate, not billed subscription spend · process evidence, not a productivity score.{filesNote ? ` ${filesNote}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
