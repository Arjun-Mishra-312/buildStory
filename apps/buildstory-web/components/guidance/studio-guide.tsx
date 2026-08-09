"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GUIDE_KEYS, GUIDE_VERSION, type GuideKey, type GuidanceRecord } from "@/lib/guidance/contracts";

type GuideStep = { target: string; title: string; body: string };
type GuideDefinition = { key: GuideKey; label: string; steps: GuideStep[] };

const DEFINITIONS: Record<GuideKey, GuideDefinition> = {
  "studio-overview": { key: "studio-overview", label: "Studio overview", steps: [
    { target: "studio-create", title: "Start a story", body: "Create a private scanner connection for a repository. Nothing is public until you review and publish it." },
    { target: "studio-reports", title: "Your report queue", body: "Ready reports wait here for review. Open one to choose what belongs in your public story." },
    { target: "studio-activity", title: "Live activity", body: "Watch scanner connections and report generation move through the handoff." },
  ] },
  "create-story": { key: "create-story", label: "Create story", steps: [
    { target: "create-narrative", title: "Choose narrative privacy", body: "Local, cloud, or off controls how narrative context is prepared. You can change this in Settings." },
    { target: "create-scanner", title: "Connect the scanner", body: "Start a one-time account-bound connection, then run the displayed command from your repository." },
    { target: "create-progress", title: "Follow progress", body: "After upload, the report stays private while it is generated and becomes available here to review." },
  ] },
  projects: { key: "projects", label: "Projects", steps: [
    { target: "projects-state", title: "Project state", body: "A project is the repository; reports are scans of that repository. The status here tells you the next action." },
    { target: "projects-history", title: "Review history", body: "Open a project to see unpublished reports and every published chapter in order." },
    { target: "projects-scan", title: "Scan for updates", body: "Once a project has a live chapter, this action starts the same-repository update flow." },
  ] },
  "project-detail": { key: "project-detail", label: "Project detail", steps: [
    { target: "project-detail-actions", title: "Next action", body: "The primary action changes with the project state: review a report, view progress, or scan for updates." },
    { target: "project-detail-drafts", title: "Private reports", body: "New scans appear here first. Review them before anything is added to your public story." },
    { target: "project-detail-chapters", title: "Chapter history", body: "Published chapters stay in a timeline so readers can see how the project evolved." },
  ] },
  "story-workbench": { key: "story-workbench", label: "Story workbench", steps: [
    { target: "workbench-views", title: "Public and private views", body: "Switch between the reader-facing preview and the complete private report." },
    { target: "workbench-actions", title: "Edit, scan, publish", body: "Edit the public page, scan the same repository for updates, or publish the current report." },
    { target: "workbench-boundary", title: "Publication boundary", body: "Only the fields you select cross from the private report into the public chapter." },
  ] },
  "scan-updates": { key: "scan-updates", label: "Scan for updates", steps: [
    { target: "update-sequence", title: "Three clear stages", body: "Scan the same repository, review the generated private report, then publish it as the next chapter." },
    { target: "update-repository", title: "Same repository", body: "The update must come from the repository that owns this project. We verify that before creating a chapter." },
    { target: "update-progress", title: "Review before publishing", body: "The report remains private while it is processing. Use Review private report when it is ready." },
  ] },
};

type GuideContextValue = {
  replayGuide: (key?: GuideKey) => void;
  currentGuide: GuideDefinition | null;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

function guideForPath(pathname: string): GuideDefinition | null {
  if (pathname === "/studio") return DEFINITIONS["studio-overview"];
  if (pathname === "/studio/connect") return DEFINITIONS["create-story"];
  if (pathname === "/studio/projects") return DEFINITIONS.projects;
  if (/^\/studio\/projects\/[^/]+\/update$/.test(pathname)) return DEFINITIONS["scan-updates"];
  if (/^\/studio\/projects\/[^/]+$/.test(pathname)) return DEFINITIONS["project-detail"];
  if (/^\/studio\/reports\/[^/]+$/.test(pathname)) return DEFINITIONS["story-workbench"];
  return null;
}

export function useStudioGuide() {
  const context = useContext(GuideContext);
  if (!context) throw new Error("useStudioGuide must be used inside StudioGuideProvider");
  return context;
}

export function StudioGuideProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentGuide = useMemo(() => guideForPath(pathname), [pathname]);
  const [records, setRecords] = useState<GuidanceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<GuideDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; left?: number; bottom?: number; centered: boolean; mobile: boolean }>({ centered: true, mobile: false });
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/creator/guidance", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload: unknown) => {
      const typed = payload as { guides?: GuidanceRecord[] } | null;
      if (!cancelled && typed?.guides) setRecords(typed.guides);
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const saveState = useCallback(async (guide: GuideDefinition, state: "completed" | "dismissed") => {
    setRecords((current) => [...current.filter((record) => !(record.guideKey === guide.key && record.guideVersion === GUIDE_VERSION)), {
      userId: "self", guideKey: guide.key, guideVersion: GUIDE_VERSION, state, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }]);
    await fetch(`/api/creator/guidance/${guide.key}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: GUIDE_VERSION, state }) }).catch(() => undefined);
  }, []);

  const close = useCallback((state: "completed" | "dismissed") => {
    if (!active) return;
    void saveState(active, state);
    setActive(null);
    setHelpOpen(false);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".studio-help-trigger")?.focus(), 0);
  }, [active, saveState]);

  const replayGuide = useCallback((key?: GuideKey) => {
    const guide = key ? DEFINITIONS[key] : currentGuide;
    if (!guide) return;
    setActive(guide);
    setStepIndex(0);
    setHelpOpen(false);
  }, [currentGuide]);

  useEffect(() => {
    if (!loaded || !currentGuide || active) return;
    const seen = records.some((record) => record.guideKey === currentGuide.key && record.guideVersion === GUIDE_VERSION && (record.state === "completed" || record.state === "dismissed"));
    if (!seen) {
      const timer = window.setTimeout(() => replayGuide(currentGuide.key), 450);
      return () => window.clearTimeout(timer);
    }
  }, [active, currentGuide, loaded, records, replayGuide]);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-guide~="${active.steps[stepIndex]?.target}"]`);
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      if (!target || mobile) { setPosition({ centered: !mobile, mobile }); return; }
      const rect = target.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + rect.width / 2 - width / 2));
      const top = rect.bottom + 14 + 240 < window.innerHeight ? rect.bottom + 14 : Math.max(16, rect.top - 240);
      setPosition({ left, top, centered: false, mobile: false });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const first = dialogRef.current?.querySelector<HTMLElement>("button, [href]");
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close("dismissed"); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href]")].filter((node) => !node.hasAttribute("disabled"));
      if (!focusable.length) return;
      const firstNode = focusable[0]!;
      const lastNode = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === firstNode) { event.preventDefault(); lastNode.focus(); }
      else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, close]);

  const step = active?.steps[stepIndex] ?? null;
  return <GuideContext.Provider value={{ replayGuide, currentGuide, helpOpen, setHelpOpen }}>
    {children}
    {active && step ? <div className="guide-layer" aria-label={`${active.label} tour`}>
      <div className="guide-scrim" aria-hidden="true" />
      <div className={`guide-popover${position.centered ? " guide-popover--centered" : ""}${position.mobile ? " guide-popover--mobile-sheet" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="guide-title" style={position.centered || position.mobile ? undefined : { top: position.top, left: position.left }}>
        <div className="guide-popover__eyebrow">{active.label} · {stepIndex + 1} of {active.steps.length}</div>
        <h2 id="guide-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="guide-popover__actions">
          <button type="button" className="button button--text" onClick={() => close("dismissed")}>Skip</button>
          {stepIndex > 0 ? <button type="button" className="button button--secondary button--small" onClick={() => setStepIndex((index) => index - 1)}>Previous</button> : null}
          {stepIndex < active.steps.length - 1 ? <button type="button" className="button button--primary button--small" onClick={() => setStepIndex((index) => index + 1)}>Next</button> : <button type="button" className="button button--primary button--small" onClick={() => close("completed")}>Done</button>}
        </div>
      </div>
    </div> : null}
    {helpOpen ? <div className="studio-help-popover" role="dialog" aria-label="Studio help">
      <strong>Tour this page</strong>
      {currentGuide ? <button type="button" onClick={() => replayGuide(currentGuide.key)}>{currentGuide.label}</button> : null}
      {GUIDE_KEYS.filter((key) => ["studio-overview", "create-story", "projects"].includes(key)).map((key) => <button type="button" key={key} onClick={() => { setHelpOpen(false); if (key === "studio-overview") router.push("/studio"); else if (key === "create-story") router.push("/studio/connect"); else router.push("/studio/projects"); }}>{DEFINITIONS[key].label}</button>)}
    </div> : null}
  </GuideContext.Provider>;
}

export function GuidanceHelp() {
  const { currentGuide, helpOpen, setHelpOpen } = useStudioGuide();
  return <button type="button" className="studio-help-trigger" aria-expanded={helpOpen} aria-label="Open Studio help" onClick={() => setHelpOpen(!helpOpen)}>Help{currentGuide ? <span aria-hidden="true">?</span> : null}</button>;
}

export function GuideTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return <span className="guide-tooltip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={`More about ${label}`} aria-expanded={open} aria-describedby={open ? tooltipId : undefined} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>i</button>
    {open ? <span id={tooltipId} role="tooltip">{children}</span> : null}
  </span>;
}
