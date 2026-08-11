import type { ReactNode } from "react";
import { blockData, type ReportBlock } from "@/lib/report/presentation";

type SignalBlockData = {
  value?: number;
  unit?: string;
  detail?: string;
  formula?: string;
  family?: string;
};

type NarrativeBlockData = {
  detail?: string;
  whyItMattered?: string;
  rationale?: string;
  outcome?: string;
  quote?: string;
  phase?: string;
  kind?: string;
  value?: number;
  unit?: string;
};

type ModelMixBlockData = {
  models?: Array<{ id: string; label: string; requests: number; totalTokens: number | null; share: number | null; costMicroUsd: number | null }>;
  totalRequests?: number;
  totalTokens?: number | null;
};

type ReportBlockProps = {
  block: ReportBlock;
  sourceByRef?: Map<string, { provider: string; occurredAt: string }>;
  onEvidence?: (ref: string) => void;
  privateView?: boolean;
};

function compactValue(value: number | undefined, unit: string | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (unit === "%") return `${Math.round(value)}%`;
  if (unit === "minutes") {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function providerLabel(provider: string): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  if (provider === "git") return "Git";
  return "Codex";
}

function SourceRefs({ block, sourceByRef, onEvidence, privateView }: Pick<ReportBlockProps, "block" | "sourceByRef" | "onEvidence" | "privateView">) {
  if (!block.sourceRefs.length) return null;
  return (
    <div className="report-block__sources">
      {block.sourceRefs.map((ref) => {
        const source = sourceByRef?.get(ref);
        const label = source ? `${providerLabel(source.provider)} · ${new Date(source.occurredAt).toLocaleDateString("en", { month: "short", day: "numeric" })}` : ref;
        return privateView && onEvidence ? (
          <button className="report-block__source" type="button" key={ref} onClick={() => onEvidence(ref)}>
            {label} · evidence
          </button>
        ) : <span className="report-block__source" key={ref}>{label}</span>;
      })}
    </div>
  );
}

function BlockFrame({ block, children, ...props }: ReportBlockProps & { children: ReactNode }) {
  return (
    <article className={`report-block report-block--${block.kind}`} data-report-block={block.id}>
      <header className="report-block__header">
        <span>{block.eyebrow}</span>
        {block.confidence ? <small>{block.confidence.toUpperCase()} CONFIDENCE</small> : null}
      </header>
      {children}
      <SourceRefs block={block} {...props} />
    </article>
  );
}

export function ReportBlockView({ block, sourceByRef, onEvidence, privateView }: ReportBlockProps) {
  const data = blockData<SignalBlockData & NarrativeBlockData & ModelMixBlockData>(block);
  if (block.kind === "metric") {
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__metric">
          <strong>{compactValue(data.value, data.unit)}</strong>
          <h3>{block.title}</h3>
          {block.summary ? <p>{block.summary}</p> : null}
        </div>
      </BlockFrame>
    );
  }

  if (block.kind === "distribution") {
    const value = Math.max(0, Math.min(100, data.value ?? 0));
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__distribution">
          <div className="report-block__distribution-value"><strong>{compactValue(data.value, data.unit)}</strong><span>of the build</span></div>
          <h3>{block.title}</h3>
          <div className="report-block__meter" aria-hidden="true"><i style={{ width: `${value}%` }} /></div>
          {block.summary ? <p>{block.summary}</p> : null}
        </div>
      </BlockFrame>
    );
  }

  if (block.kind === "decision") {
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__decision">
          <h3>{block.title}</h3>
          <div><span>WHY</span><p>{data.rationale ?? block.summary}</p></div>
          {data.outcome ? <div><span>OUTCOME</span><p>{data.outcome}</p></div> : null}
        </div>
      </BlockFrame>
    );
  }

  if (block.kind === "quote") {
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <blockquote className="report-block__quote">“{data.quote ?? block.summary ?? block.title}”</blockquote>
        {data.detail ? <p className="report-block__note">{data.detail}</p> : null}
      </BlockFrame>
    );
  }

  if (block.kind === "comparison") {
    const comparisonValue = typeof data.value === "number"
      ? data.unit === "micro-USD"
        ? `$${(data.value / 1_000_000).toFixed(2)}`
        : compactValue(data.value, data.unit)
      : null;
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__comparison">
          {comparisonValue ? <strong className="report-block__comparison-value">{comparisonValue}</strong> : null}
          <h3>{block.title}</h3>
          <p>{block.summary ?? data.detail}</p>
          <div className="report-block__comparison-line"><i /><span>Observed pattern</span></div>
        </div>
      </BlockFrame>
    );
  }

  if (block.kind === "model-mix") {
    const models = data.models ?? [];
    const totalRequests = data.totalRequests ?? models.reduce((sum, model) => sum + model.requests, 0);
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__model-mix">
          <div className="report-block__model-mix-total">
            <strong>{totalRequests.toLocaleString("en-US")}</strong>
            <span>model calls observed</span>
          </div>
          <div className="report-block__model-mix-list">
            {models.map((model) => {
              const requestShare = totalRequests > 0 ? Math.round((model.requests / totalRequests) * 100) : 0;
              return (
                <div className="report-block__model-row" key={model.id}>
                  <div className="report-block__model-row-label"><strong>{model.label}</strong><span>{model.requests.toLocaleString("en-US")} calls{model.totalTokens != null ? ` · ${compactValue(model.totalTokens, "tokens")} tokens` : ""}</span></div>
                  <div className="report-block__model-row-bar" aria-label={`${model.label}: ${requestShare}% of model calls`}><i style={{ width: `${Math.max(0, Math.min(100, requestShare))}%` }} /></div>
                  <span className="report-block__model-row-share">{model.share == null ? `${requestShare}%` : `${model.share}% cost`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </BlockFrame>
    );
  }

  if (block.kind === "evidence") {
    return (
      <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
        <div className="report-block__evidence"><strong>Verified from source data</strong><p>{block.summary}</p><span>Redacted locally · publishing optional</span></div>
      </BlockFrame>
    );
  }

  return (
    <BlockFrame block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView}>
      <div className="report-block__timeline">
        <div className="report-block__timeline-marker" aria-hidden="true" />
        <div>
          <h3>{block.title}</h3>
          {block.summary ? <p>{block.summary}</p> : null}
          {data.whyItMattered ? <div className="report-block__why"><span>WHY IT MATTERED</span><p>{data.whyItMattered}</p></div> : null}
        </div>
      </div>
    </BlockFrame>
  );
}

export function ReportBlockList({ blocks, sourceByRef, onEvidence, privateView }: { blocks: ReportBlock[] } & Omit<ReportBlockProps, "block">) {
  if (!blocks.length) return null;
  return <div className="report-block-list">{blocks.map((block) => <ReportBlockView key={block.id} block={block} sourceByRef={sourceByRef} onEvidence={onEvidence} privateView={privateView} />)}</div>;
}
