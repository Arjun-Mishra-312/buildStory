import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { ModelName } from "@/components/model-mark";

type MixModel = PublicBuildStoryViewModel["models"][number];

const SEGMENT_COLORS = ["#2447d8", "#f36f56", "#2f7250", "#d59a3e", "#3d4a9c", "#dce3ff"];

function mixFromModels(models: MixModel[]): { segments: Array<{ id: string; label: string; provider?: string; pct: number }>; unit: string } | null {
  const priced = models.filter((model) => model.share != null && model.share > 0);
  if (priced.length) {
    return {
      segments: priced.map((model) => ({ id: model.id, label: model.label, provider: model.provider, pct: model.share as number })),
      unit: "of estimated spend",
    };
  }
  const totalRequests = models.reduce((sum, model) => sum + model.requests, 0);
  if (totalRequests <= 0) return null;
  const segments = models
    .filter((model) => model.requests > 0)
    .map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      pct: Math.round((model.requests * 100) / totalRequests),
    }))
    .filter((segment) => segment.pct > 0);
  if (!segments.length) return null;
  return { segments, unit: "of model calls" };
}

export function ModelMixStrip({ models }: { models: MixModel[] }) {
  const mix = mixFromModels(models);
  if (!mix) return null;
  return (
    <section className="model-mix-strip section-wrap" aria-label="Model mix">
      <header>
        <span>MODEL MIX</span>
        <strong>How the work was split</strong>
      </header>
      <div
        className="model-mix-strip__bar"
        role="img"
        aria-label={mix.segments.map((segment) => `${segment.label} ${segment.pct}% ${mix.unit}`).join(", ")}
      >
        {mix.segments.map((segment, index) => (
          <span
            key={segment.id}
            style={{ flexGrow: segment.pct, flexBasis: 0, background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
            title={`${segment.label} ${segment.pct}%`}
          />
        ))}
      </div>
      <ul>
        {mix.segments.map((segment, index) => (
          <li key={segment.id}>
            <i style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} />
            <ModelName id={segment.id} label={segment.label} provider={segment.provider} />
            <strong>{segment.pct}%</strong>
            <small>{mix.unit}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
