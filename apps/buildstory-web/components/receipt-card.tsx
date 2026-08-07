import type { PublicBuildStoryViewModel } from "@/lib/build-story";

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
>;

type ReceiptCardProps = {
  story: ReceiptStory;
  compact?: boolean;
};

const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMicroUsd = (microUsd: number) => usdFormat.format(microUsd / 1_000_000);

export function ReceiptCard({ story, compact = false }: ReceiptCardProps) {
  return (
    <aside className={`receipt ${compact ? "receipt--compact" : ""}`}>
      <div className="receipt__teeth receipt__teeth--top" aria-hidden="true" />
      <div className="receipt__header">
        <div>
          <span className="receipt__kicker">AI Build Receipt</span>
          <strong>{story.name}</strong>
        </div>
        <span className="receipt__seal" aria-label="Snapshot verified">
          ✓
        </span>
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
      <div className="receipt__barcode" aria-hidden="true" />
      <p className="receipt__fineprint">
        Rate-card estimate, not billed subscription spend · process evidence, not a productivity score.
      </p>
      <div className="receipt__teeth receipt__teeth--bottom" aria-hidden="true" />
    </aside>
  );
}
