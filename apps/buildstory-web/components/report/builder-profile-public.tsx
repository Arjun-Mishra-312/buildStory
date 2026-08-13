"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import type { ComputedArchetype } from "@/lib/ingestion/profile";
import {
  catalogEntry,
  evidenceLine,
  fanArchetypes,
  rarityCopy,
  type PublicArchetypeCounts,
} from "@/lib/report/archetype-catalog";
import { illustrationForArchetype } from "@/lib/report/poster-art";
import { ModelName } from "@/components/model-mark";

type ProfileSlice = NonNullable<PublicBuildStoryViewModel["profile"]>;
type StoryContext = Pick<
  PublicBuildStoryViewModel,
  "sessionCount" | "activeDays" | "buildHours" | "subagentCount" | "models" | "tools"
>;

const CARD_BACK = "/assets/illustrations/cards/card-back.png";
const DRAW_MS = 1400;
const FLIP_MS = 720;
const FAN_ROTATE = [-18, -9, 0, 9, 18];
const FAN_LIFT = [18, 6, 0, 6, 18];

type Phase = "resting" | "drawing" | "flipping" | "revealed";

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function modelLabel(id: string | null, models: StoryContext["models"]): string | null {
  if (!id) return null;
  return models.find((model) => model.id === id)?.label ?? id.replaceAll("-", " ").replace(":", " · ");
}

function TarotCard({
  name,
  faceUp,
  drawn,
  index,
  live,
}: {
  name: ComputedArchetype;
  faceUp: boolean;
  drawn: boolean;
  index: number;
  live?: boolean;
}) {
  const entry = catalogEntry(name);
  const cardRef = useRef<HTMLDivElement>(null);

  function resetTilt() {
    const node = cardRef.current;
    if (!node) return;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!live || prefersReducedMotion()) return;
    const node = cardRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    node.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
    node.style.setProperty("--tilt-y", `${(x * 9).toFixed(2)}deg`);
  }

  return (
    <div
      ref={cardRef}
      className="profile-tarot"
      data-drawn={drawn ? "true" : "false"}
      data-face={faceUp ? "true" : "false"}
      data-live={live ? "true" : "false"}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      style={{
        zIndex: drawn ? 5 : index + 1,
        ["--fan-rot" as string]: `${FAN_ROTATE[index] ?? 0}deg`,
        ["--fan-lift" as string]: `${FAN_LIFT[index] ?? 0}px`,
        animationDelay: `${index * 70}ms`,
      }}
    >
      <div className="profile-tarot__inner">
        <div className="profile-tarot__back" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CARD_BACK} alt="" />
        </div>
        <div className="profile-tarot__face">
          <div className="profile-tarot__plate" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={illustrationForArchetype(entry.name)} alt="" />
          </div>
          <strong>{entry.name}</strong>
        </div>
      </div>
    </div>
  );
}

export function BuilderProfilePublic({
  profile,
  story,
  seed,
  archetypeCounts = null,
  interactive = true,
}: {
  profile: ProfileSlice;
  story: StoryContext;
  seed: string;
  archetypeCounts?: PublicArchetypeCounts | null;
  interactive?: boolean;
}) {
  const statusId = useId();
  const archetypeName = profile.archetype?.name ?? null;
  const catalog = catalogEntry(archetypeName);
  const fan = useMemo(() => fanArchetypes(archetypeName, seed), [archetypeName, seed]);
  const [phase, setPhase] = useState<Phase>(() => (interactive ? "resting" : "revealed"));
  const visiblePhase: Phase = interactive ? phase : "revealed";

  useEffect(() => {
    if (!interactive || !prefersReducedMotion()) return;
    const timer = window.setTimeout(() => setPhase("revealed"), 0);
    return () => window.clearTimeout(timer);
  }, [interactive]);

  useEffect(() => {
    if (phase !== "drawing") return;
    const flip = window.setTimeout(() => setPhase("flipping"), DRAW_MS);
    return () => window.clearTimeout(flip);
  }, [phase]);

  useEffect(() => {
    if (phase !== "flipping") return;
    const reveal = window.setTimeout(() => setPhase("revealed"), FLIP_MS);
    return () => window.clearTimeout(reveal);
  }, [phase]);

  const patterns = profile.workPatterns;
  const topModels = [...story.models]
    .sort((left, right) => (right.share ?? right.requests) - (left.share ?? left.requests))
    .slice(0, 3);
  const topTools = [...story.tools]
    .sort((left, right) => right.callCount - left.callCount)
    .slice(0, 3);
  const primary = modelLabel(patterns?.primaryModel ?? null, story.models);
  const evidence = evidenceLine(archetypeName, patterns);

  const facts: Array<{ label: string; value: string }> = [];
  if (story.sessionCount > 0 && story.activeDays > 0) {
    facts.push({ label: "Build window", value: `${story.sessionCount} sessions · ${story.activeDays} active days` });
  }
  if (story.buildHours > 0) facts.push({ label: "Active time", value: `${story.buildHours} hours` });
  if (patterns?.longestSessionMinutes) facts.push({ label: "Longest session", value: formatMinutes(patterns.longestSessionMinutes) });
  if (patterns?.medianSessionMinutes) facts.push({ label: "Median session", value: formatMinutes(patterns.medianSessionMinutes) });
  if (patterns?.timezoneLabel) facts.push({ label: "Timezone", value: patterns.timezoneLabel });
  if (patterns?.peakHours?.length) facts.push({ label: "Peak hours", value: patterns.peakHours.map(formatHour).join(", ") });
  if (patterns?.preferredDays?.length) facts.push({ label: "Preferred days", value: patterns.preferredDays.join(", ") });
  if (primary) facts.push({ label: "Primary model", value: primary });

  const faceUp = visiblePhase === "flipping" || visiblePhase === "revealed";
  const busy = visiblePhase === "drawing" || visiblePhase === "flipping";

  if (!archetypeName && !facts.length && !topModels.length && !topTools.length) return null;

  return (
    <div
      className="builder-profile-public"
      data-phase={archetypeName ? visiblePhase : "revealed"}
      data-interactive={interactive ? "true" : "false"}
      aria-busy={busy}
    >
      {archetypeName ? (
        <div className="builder-profile-public__fan" aria-hidden={visiblePhase === "revealed"} aria-label="Builder profile cards">
          {fan.map((name, index) => (
            <TarotCard
              key={`${name}-${index}`}
              name={name}
              index={index}
              drawn={index === 2}
              faceUp={index === 2 && faceUp}
              live={index === 2 && visiblePhase === "revealed"}
            />
          ))}
        </div>
      ) : null}

      {interactive && archetypeName && visiblePhase === "resting" ? (
        <div className="builder-profile-public__cta">
          <button className="button button--primary" type="button" onClick={() => setPhase("drawing")}>
            Reveal builder profile
          </button>
        </div>
      ) : null}

      {busy ? (
        <p className="builder-profile-public__status" id={statusId} aria-live="polite">
          Reading the build…
        </p>
      ) : null}

      <dl className="builder-profile-public__facts" hidden={Boolean(archetypeName) && visiblePhase !== "revealed"}>
        {facts.map((fact) => (
          <div className="builder-profile-public__stat" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        {topModels.length ? (
          <div className="builder-profile-public__stat builder-profile-public__chips">
            <dt>Model mix</dt>
            <dd>
              {topModels.map((model) => (
                <span key={model.id}>
                  <ModelName id={model.id} label={model.label} provider={model.provider} />
                  {model.share != null ? ` ${model.share}%` : ""}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {topTools.length ? (
          <div className="builder-profile-public__stat builder-profile-public__chips">
            <dt>Tooling</dt>
            <dd>
              {topTools.map((tool) => (
                <span key={tool.id}>{tool.label}</span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {archetypeName ? (
        <div className="builder-profile-public__persona" hidden={visiblePhase !== "revealed"}>
          <p className="builder-profile-public__kicker">{catalog.kicker}</p>
          <p className="builder-profile-public__lore">{catalog.signifies}</p>
          {evidence ? <p className="builder-profile-public__evidence">{evidence}</p> : null}
          <ul>
            {catalog.traits.map((trait) => (
              <li key={trait}>{trait}</li>
            ))}
          </ul>
          <small>{rarityCopy(archetypeName, archetypeCounts)}</small>
          {interactive ? (
            <button className="button button--text" type="button" onClick={() => setPhase("resting")}>
              Draw again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
