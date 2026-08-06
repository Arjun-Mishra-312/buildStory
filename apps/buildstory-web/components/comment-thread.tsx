"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type CommentAuthor = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Comment = {
  id: string;
  parentCommentId: string | null;
  author: CommentAuthor;
  body: string;
  status: "visible" | "deleted" | "hidden";
  createdAt: string;
};

export function CommentThread({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { comments: Comment[] };
        setComments(data.comments);
      } else {
        setError("Comments are temporarily unavailable.");
      }
    } catch {
      setError("Comments are temporarily unavailable.");
    }
  }, [storyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function goToSignIn() {
    router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
  }

  async function submit(body: string, parentCommentId: string | null) {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
      if (response.status === 401) return goToSignIn();
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Could not post that comment.");
        return;
      }
      if (parentCommentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments/${commentId}`, { method: "DELETE" });
      if (response.status === 401) return goToSignIn();
      if (response.ok) await load();
      else setError("That comment could not be removed.");
    } catch {
      setError("That comment could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmitTop(event: FormEvent) {
    event.preventDefault();
    void submit(draft, null);
  }

  function onSubmitReply(event: FormEvent, parentId: string) {
    event.preventDefault();
    void submit(replyDraft, parentId);
  }

  const topLevel = comments.filter((comment) => comment.parentCommentId === null);
  const repliesFor = (parentId: string) => comments.filter((comment) => comment.parentCommentId === parentId);

  return (
    <section className="comment-thread">
      <h2>Comments</h2>
      <form onSubmit={onSubmitTop} className="comment-thread__form">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share a thought about this build…"
          rows={3}
          maxLength={1_000}
        />
        <button type="submit" className="button button--primary button--small" disabled={busy || !draft.trim()}>
          Post comment
        </button>
      </form>
      {error ? <p className="comment-thread__error">{error}</p> : null}

      <ul className="comment-thread__list">
        {topLevel.map((comment) => (
          <li key={comment.id}>
            <div className="comment">
              <strong>{comment.status === "deleted" ? "" : comment.author.displayName}</strong>
              <p>{comment.status === "deleted" ? "[deleted]" : comment.body}</p>
              {comment.status !== "deleted" ? (
                <div className="comment__actions">
                  <button type="button" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
                    Reply
                  </button>
                  <button type="button" onClick={() => void remove(comment.id)}>
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
            {replyTo === comment.id ? (
              <form onSubmit={(event) => onSubmitReply(event, comment.id)} className="comment-thread__form comment-thread__form--reply">
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder={`Reply to ${comment.author.displayName}…`}
                  rows={2}
                  maxLength={1_000}
                />
                <button type="submit" className="button button--secondary button--small" disabled={busy || !replyDraft.trim()}>
                  Post reply
                </button>
              </form>
            ) : null}
            <ul className="comment-thread__replies">
              {repliesFor(comment.id).map((reply) => (
                <li key={reply.id} className="comment">
                  <strong>{reply.status === "deleted" ? "" : reply.author.displayName}</strong>
                  <p>{reply.status === "deleted" ? "[deleted]" : reply.body}</p>
                  {reply.status !== "deleted" ? (
                    <div className="comment__actions">
                      <button type="button" onClick={() => void remove(reply.id)}>
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
