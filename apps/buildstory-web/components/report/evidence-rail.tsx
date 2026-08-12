import type { ReactNode } from "react";
import type { EvidenceViewModel } from "@/lib/report/evidence-view-model";
import { ReceiptCard } from "@/components/receipt-card";
import { ReportSection } from "@/components/studio/report-section";

type ReceiptStory = Parameters<typeof ReceiptCard>[0]["story"];

const sourceDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Distribution({ title, basis, rows }: { title: string; basis?: string | null; rows: EvidenceViewModel["modelDistribution"] }) {
  if (!rows.length) return null;
  return (
    <section className="evidence-rail__section evidence-rail__distribution">
      <header><span>{title}</span>{basis ? <small>{basis}</small> : null}</header>
      <div>
        {rows.slice(0, 8).map((row) => (
          <div className="evidence-distribution__row" key={row.id}>
            <span><strong>{row.label}</strong><small>{row.value}</small></span>
            <i aria-hidden="true"><i style={{ width: `${row.percent}%` }} /></i>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EvidenceRail({
  model,
  receiptStory,
  onViewPrivate,
  privateSections,
  signalsSection,
  showSignals = true,
  showTimeline = true,
  showSources = true,
  receiptOnly = false,
}: {
  model: EvidenceViewModel;
  receiptStory?: ReceiptStory;
  onViewPrivate?: () => void;
  privateSections?: ReactNode;
  signalsSection?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  } | null;
  showSignals?: boolean;
  showTimeline?: boolean;
  showSources?: boolean;
  receiptOnly?: boolean;
}) {
  const signalList = model.signals.length ? (
    <ol>
      {model.signals.map((signal) => <li key={signal.id}><strong>{signal.headline}</strong><p>{signal.detail}</p></li>)}
    </ol>
  ) : null;

  return (
    <div className={`evidence-rail${receiptOnly ? " evidence-rail--receipt-only" : ""}`}>
      {!receiptOnly && model.metrics.length ? (
        <section className="evidence-rail__section evidence-fact-rail" aria-label="By the numbers">
          <header><span>BY THE NUMBERS</span><small>Validated report facts</small></header>
          <div className="evidence-fact-rail__grid">
            {model.metrics.map((metric) => (
              <div className={`evidence-fact evidence-fact--${metric.tone}`} key={metric.id}>
                <strong>{metric.value}</strong><span>{metric.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!receiptOnly && model.gitDiff ? (
        <section className="evidence-rail__section evidence-diff">
          <header><span>GIT CHANGESET</span><small>Observed aggregate</small></header>
          <div className="evidence-diff__bar" aria-label={`${model.gitDiff.additions.toLocaleString()} additions and ${model.gitDiff.deletions.toLocaleString()} deletions`}>
            <i style={{ width: `${model.gitDiff.additionPercent}%` }} /><i />
          </div>
          <div><ins>+{model.gitDiff.additions.toLocaleString()}</ins><del>−{model.gitDiff.deletions.toLocaleString()}</del></div>
        </section>
      ) : null}

      {!receiptOnly && showTimeline && model.timeline.length ? (
        <section className="evidence-rail__section evidence-timeline">
          <header><span>BUILD TIMELINE</span><small>{model.timeline.length} milestones</small></header>
          <ol>
            {model.timeline.map((milestone) => (
              <li key={milestone.id}><i aria-hidden="true" /><div><small>{milestone.date} · {milestone.kind}</small><strong>{milestone.title}</strong></div></li>
            ))}
          </ol>
        </section>
      ) : null}

      {!receiptOnly ? <Distribution title="MODEL MIX" basis={model.modelDistributionBasis} rows={model.modelDistribution} /> : null}
      {!receiptOnly ? <Distribution title="TOOL USE" basis="sessions observed" rows={model.toolDistribution} /> : null}

      {!receiptOnly && showSignals && signalList && signalsSection ? (
        <ReportSection
          id="narrativeSignals"
          variant="inline"
          label="COMPUTED SIGNALS"
          summary="Never model-written"
          open={signalsSection.open}
          onOpenChange={signalsSection.onOpenChange}
          className="evidence-rail__section evidence-signals"
        >
          {signalList}
        </ReportSection>
      ) : !receiptOnly && showSignals && signalList ? (
        <section className="evidence-rail__section evidence-signals">
          <header><span>COMPUTED SIGNALS</span><small>Never model-written</small></header>
          {signalList}
        </section>
      ) : null}

      {!receiptOnly && showSources && model.sources.length ? (
        <section className="evidence-rail__section evidence-sources">
          <header><span>SOURCE COVERAGE</span><small>{model.sources.length} linked sources</small></header>
          <ol>
            {model.sources.map((source) => (
              <li key={source.ref}><span>{source.ref}</span><strong>{source.label}</strong><small>{sourceDate.format(new Date(source.occurredAt))} · {source.evidenceCount} evidence</small></li>
            ))}
          </ol>
        </section>
      ) : null}

      {receiptStory ? (
        <section className="evidence-rail__receipt">
          <ReceiptCard story={receiptStory} compact />
          {onViewPrivate ? <button type="button" className="receipt-source-link" onClick={onViewPrivate}>View private source report <span aria-hidden="true">→</span></button> : null}
        </section>
      ) : null}

      {!receiptOnly ? privateSections : null}
    </div>
  );
}
