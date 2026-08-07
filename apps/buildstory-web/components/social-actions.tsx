"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportDialog } from "./report-dialog";
import { optimisticReactionSummary } from "@/lib/social/optimistic-reaction";
import type { ReactionKind, ReactionSummary } from "@/lib/social/contracts";

const REACTION_ORDER = ["fire", "mindblown", "relatable", "shipped"] as const;
const REACTION_META: Record<string, { emoji: string; label: string }> = {
  fire: { emoji: "🔥", label: "Energizing" },
  mindblown: { emoji: "💡", label: "Aha moment" },
  relatable: { emoji: "🤝", label: "Relatable" },
  shipped: { emoji: "🚀", label: "Ship it" },
};
type FollowState = { followerCount: number; followingCount: number; isFollowedByViewer: boolean };

export function SocialActions({ storyId, ownerHandle }: { storyId: string; ownerHandle: string }) {
  const router = useRouter();
  const [reactions, setReactions] = useState<ReactionSummary | null>(null);
  const [follow, setFollow] = useState<FollowState | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [reactionResponse, profileResponse] = await Promise.all([
          fetch(`/api/stories/${encodeURIComponent(storyId)}/reactions`, { cache: "no-store" }),
          fetch(`/api/users/${encodeURIComponent(ownerHandle)}`, { cache: "no-store" }),
        ]);
        if (reactionResponse.ok) setReactions((await reactionResponse.json()) as ReactionSummary);
        if (profileResponse.ok) {
          const data = (await profileResponse.json()) as { follow: FollowState; isSelf: boolean };
          setFollow(data.follow); setIsSelf(data.isSelf);
        }
      } catch { setError("Social activity is temporarily unavailable."); }
    })();
  }, [storyId, ownerHandle]);

  const goToSignIn = () => router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);

  async function react(kind: ReactionKind) {
    if (busy) return;
    const previous = reactions;
    setBusy(true); setError(null);
    setReactions((current) => current ? optimisticReactionSummary(current, kind) : current);
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      if (response.status === 401) return goToSignIn();
      if (response.ok) setReactions((await response.json()) as ReactionSummary);
      else { setReactions(previous); setError("That reaction could not be saved. Your reaction was restored."); }
    } catch { setReactions(previous); setError("That reaction could not be saved. Your reaction was restored."); }
    finally { setBusy(false); }
  }

  async function toggleFollow() {
    if (busy || !follow) return;
    setBusy(true); setError(null);
    try {
      const method = follow.isFollowedByViewer ? "DELETE" : "POST";
      const response = await fetch(`/api/users/${encodeURIComponent(ownerHandle)}/follow`, { method });
      if (response.status === 401) return goToSignIn();
      if (!response.ok) { setError("That follow change could not be saved."); return; }
      setFollow((current) => current ? { ...current, isFollowedByViewer: !current.isFollowedByViewer, followerCount: current.followerCount + (current.isFollowedByViewer ? -1 : 1) } : current);
    } catch { setError("That follow change could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="social-actions" aria-live="polite">
    {error ? <p className="comment-thread__error" role="alert">{error}</p> : null}
    <div className="social-actions__heading"><strong>React to this build</strong>{reactions ? <span>{reactions.total} {reactions.total === 1 ? "reaction" : "reactions"}</span> : <span className="inline-loading"><i aria-hidden="true" /> Loading reactions</span>}</div>
    <div className="social-actions__reactions" role="group" aria-label="React to this build story" aria-busy={!reactions || busy}>
      {REACTION_ORDER.map((kind) => <button key={kind} type="button" className={reactions?.viewerReaction === kind ? "is-active" : undefined} onClick={() => void react(kind)} disabled={busy || !reactions} aria-pressed={reactions?.viewerReaction === kind} aria-label={`${REACTION_META[kind].label}: ${reactions?.counts[kind] ?? 0} reactions`}><span className="reaction-emoji" aria-hidden="true">{REACTION_META[kind].emoji}</span><span>{REACTION_META[kind].label}</span><strong>{reactions?.counts[kind] ?? "–"}</strong></button>)}
    </div>
    {follow && !isSelf ? <button type="button" className={`button button--small ${follow.isFollowedByViewer ? "button--secondary" : "button--primary"}`} onClick={() => void toggleFollow()} disabled={busy}>{follow.isFollowedByViewer ? "Following" : `Follow @${ownerHandle}`}</button> : null}
    {!isSelf ? <ReportDialog targetType="report" targetId={storyId} label="Report this story" /> : null}
  </div>;
}
