"use client";

import { useState } from "react";
import { ResponsiveBoxPlot } from "@nivo/boxplot";
import type { SessionShapeMetric, SessionShapeSeries } from "@/lib/report/report-insights-view-model";
import { buildstoryNivoTheme, ReportFigure } from "./report-figure";

export function SessionShape({ series }: { series: SessionShapeSeries[] }) {
  const [metric, setMetric] = useState<SessionShapeMetric>(series[0]?.metric ?? "duration");
  const current = series.find((item) => item.metric === metric) ?? series[0];
  if (!current) return null;
  const data = current.values.map((value, index) => ({ group: current.label, sample: `Session ${index + 1}`, value }));
  const max = Math.max(1, current.maximum);
  return (
    <ReportFigure
      id="session-shape"
      index="04"
      title="SESSION SHAPE"
      question="How variable were the work sessions?"
      description={current.useBoxPlot ? "The box summarizes the middle half and median; every observed session remains visible below." : "This report has too few distinct observations for a useful box plot, so every value is shown directly."}
      sourceNote={`Private source: metadata-only session facts. N = ${current.values.length}. No productivity benchmark is implied.`}
      className="session-shape"
      table={<table><thead><tr><th>Observation</th><th>{current.label}</th></tr></thead><tbody>{current.values.map((value, index) => <tr key={`${value}-${index}`}><th>Session {index + 1}</th><td>{value.toLocaleString()} {current.unit}</td></tr>)}</tbody></table>}
    >
      <div className="session-shape__tabs" role="tablist" aria-label="Session metric">{series.map((item) => <button type="button" role="tab" aria-selected={item.metric === current.metric} key={item.metric} onClick={() => setMetric(item.metric)}>{item.label}</button>)}</div>
      {current.useBoxPlot ? <div className="session-shape__chart" role="img" aria-label={`${current.label} distribution, median ${Math.round(current.median)} ${current.unit}`}>
        <ResponsiveBoxPlot
          data={data}
          groupBy="group"
          value="value"
          theme={{ ...buildstoryNivoTheme, translation: {} }}
          margin={{ top: 18, right: 28, bottom: 42, left: 64 }}
          minValue={0}
          maxValue="auto"
          padding={0.58}
          colors={["var(--cobalt-soft)"]}
          borderColor="var(--ink)"
          medianColor="var(--cobalt)"
          whiskerColor="var(--ink)"
          borderWidth={1}
          medianWidth={3}
          whiskerWidth={1}
          enableGridX={false}
          enableGridY
          animate={false}
          isInteractive
          axisBottom={{ tickSize: 0, tickPadding: 10 }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          role="img"
          ariaLabel={`${current.label} box plot`}
        />
      </div> : null}
      <div className="session-shape__dot-strip" aria-label="Individual observations">{current.values.map((value, index) => <i key={`${value}-${index}`} style={{ left: `${(value / max) * 100}%` }} title={`Session ${index + 1}: ${value} ${current.unit}`} />)}</div>
      <dl className="session-shape__summary"><div><dt>Minimum</dt><dd>{Math.round(current.minimum)}</dd></div><div><dt>Median</dt><dd>{Math.round(current.median)}</dd></div><div><dt>Maximum</dt><dd>{Math.round(current.maximum)}</dd></div><div><dt>Unit</dt><dd>{current.unit}</dd></div></dl>
    </ReportFigure>
  );
}
