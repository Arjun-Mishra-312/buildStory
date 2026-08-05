"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const REACTION_LABELS: Record<string, string> = {
  fire: "🔥",
  mindblown: "🤯",
  relatable: "😅",
  shipped: "🚀",
};
const REACTION_ORDER = ["fire", "mindblown", "relatable", "shipped"] as const;

type ReactionSummary = {
  counts: Record<string, number>;
  total: number;
  viewerReaction: string | null;
};

type FollowState = {
  followerCount: number;
  followingCount: number;
  isFollowedByViewer: boolean;
};

type SocialActionsProps = {
  slug: string;
  ownerHandle: string;
};

export function SocialActions({ slug, ownerHandle }: SocialActionsProps) {
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
        fetch(`/api/stories/${encodeURIComponent(slug)}/reactions`, { cache: "no-store" }),
        fetch(`/api/users/${encodeURIComponent(ownerHandle)}`, { cache: "no-store" }),
        ]);
        if (reactionResponse.ok) setReactions((await reactionResponse.json()) as ReactionSummary);
        if (profileResponse.ok) {
          const data = (await profileResponse.json()) as { follow: FollowState; isSelf: boolean };
          setFollow(data.follow);
          setIsSelf(data.isSelf);
        }
      } catch {
        setError("Social activity is temporarily unavailable.");
      }
    })();
  }, [slug, ownerHandle]);

  function goToSignIn() {
    router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
  }

  async function react(kind: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(slug)}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (response.status === 401) return goToSignIn();
      if (response.ok) setReactions((await response.json()) as ReactionSummary);
      else setError("That reaction could not be saved.");
    } catch {
      setError("That reaction could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow() {
    if (busy || !follow) return;
    setBusy(true);
    try {
      const method = follow.isFollowedByViewer ? "DELETE" : "POST";
      const response = await fetch(`/api/users/${encodeURIComponent(ownerHandle)}/follow`, { method });
      if (response.status === 401) return goToSignIn();
      if (!response.ok) {
        setError("That follow change could not be saved.");
        return;
      }
      setFollow((current) =>
        current
          ? {
              ...current,
              isFollowedByViewer: !current.isFollowedByViewer,
              followerCount: current.followerCount + (current.isFollowedByViewer ? -1 : 1),
            }
          : current,
      );
    } catch {
      setError("That follow change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="social-actions">
      {error ? <p className="comment-thread__error" role="alert">{error}</p> : null}
      <div className="social-actions__reactions" role="group" aria-label="React to this build story">
        {REACTION_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            className={reactions?.viewerReaction === kind ? "is-active" : undefined}
            onClick={() => void react(kind)}
            disabled={busy}
          >
            <span aria-hidden="true">{REACTION_LABELS[kind]}</span>
            <span>{reactions?.counts[kind] ?? 0}</span>
          </button>
        ))}
      </div>
      {follow && !isSelf ? (
        <button
          type="button"
          className={`button button--small ${follow.isFollowedByViewer ? "button--secondary" : "button--primary"}`}
          onClick={() => void toggleFollow()}
          disabled={busy}
        >
          {follow.isFollowedByViewer ? "Following" : `Follow @${ownerHandle}`}
        </button>
      ) : null}
    </div>
  );
}
