import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { Tooltip } from "./shell/tooltip";

type ReceiptStory = Pick<
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

type ReceiptCardProps = {
  story: ReceiptStory;
  compact?: boolean;
};

const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMicroUsd = (microUsd: number) => usdFormat.format(microUsd / 1_000_000);

export function ReceiptCard({ story, compact = false }: ReceiptCardProps) {
  const coverageNotes: string[] = [];
  if (story.coverage && story.coverage.sessionsSkipped > 0) {
    const n = story.coverage.sessionsSkipped;
    coverageNotes.push(`${n.toLocaleString()} session${n === 1 ? "" : "s"} outside the selected window ${n === 1 ? "isn't" : "aren't"} reflected in these totals.`);
  }
  if (story.coverage && story.coverage.partiallyPricedModels > 0) {
    const n = story.coverage.partiallyPricedModels;
    coverageNotes.push(`${n.toLocaleString()} model${n === 1 ? "" : "s"} priced only part of its observed usage.`);
  }

  return (
    <aside className={`receipt ${compact ? "receipt--compact" : ""}`}>
      <div className="receipt__teeth receipt__teeth--top" aria-hidden="true" />
      <div className="receipt__header">
        <div>
          <span className="receipt__kicker">AI Build Receipt</span>
          <strong>{story.name}</strong>
        </div>
        <Tooltip label="This receipt matches the original AI session logs" side="bottom">
          <span className="receipt__seal" aria-label="Snapshot verified" tabIndex={0}>
            ✓
          </span>
        </Tooltip>
      </div>

      <div className="receipt__rule" />
      <dl className="receipt__rows">
        <div>
          <dt>Build ID</dt>
          <dd>{story.receiptId}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{story.dateRange}</dd>
        </div>
        <div>
          <dt>Active build time</dt>
          <dd>{story.buildHours} hours</dd>
        </div>
        <div>
          <dt>AI sessions</dt>
          <dd>{story.sessionCount} sessions{story.subagentCount > 0 ? ` · ${story.subagentCount} subagent runs` : ""}</dd>
        </div>
      </dl>

      <div className="receipt__rule receipt__rule--dashed" />
      <div className="receipt__section">
        <span className="receipt__section-label">Model mix</span>
        {story.models.map((model) => (
          <div className="receipt__model" key={model.id}>
            <div>
              <span>{model.label}</span>
              <span>
                {model.share === null ? "unpriced" : `${model.share}%`}
                {model.costMicroUsd != null ? <em className="receipt__model-cost">{formatMicroUsd(model.costMicroUsd)}</em> : null}
              </span>
            </div>
            <span className="receipt__bar" aria-hidden="true">
              <span style={{ width: `${model.share ?? 0}%` }} />
            </span>
          </div>
        ))}
      </div>

      <div className="receipt__rule receipt__rule--dashed" />
      <div className={`receipt__totals ${story.cost?.totalMicroUsd != null ? "receipt__totals--with-cost" : ""}`}>
        <div>
          <strong>{story.git.commits}</strong>
          <span>commits</span>
        </div>
        <div>
          <strong>{story.git.filesTouched}</strong>
          <span>files touched</span>
        </div>
        <div>
          <strong>{story.modelRequests}</strong>
          <span>model calls</span>
        </div>
        {story.cost?.totalMicroUsd != null ? (
          <div>
            <strong>{formatMicroUsd(story.cost.totalMicroUsd)}</strong>
            <span>est. API-equivalent spend</span>
          </div>
        ) : null}
      </div>

      <div className="receipt__privacy">
        <span aria-hidden="true">●</span>
        Redacted locally · {story.redaction.tokensRemoved.toLocaleString()} tokens
        withheld
      </div>
      {story.cost && story.cost.unpricedTokens > 0 ? (
        <p className="receipt__fineprint">
          {story.cost.unpricedTokens.toLocaleString()} tokens from unpriced models are excluded from the cost-share denominator.
        </p>
      ) : null}
      {coverageNotes.length > 0 ? (
        <p className="receipt__fineprint">{coverageNotes.join(" ")}</p>
      ) : null}
      <div className="receipt__barcode" aria-hidden="true" />
      <p className="receipt__fineprint">
        Rate-card estimate, not billed subscription spend · process evidence, not a productivity score.
      </p>
      <div className="receipt__teeth receipt__teeth--bottom" aria-hidden="true" />
    </aside>
  );
}
