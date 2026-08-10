"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ReportDialog } from "./report-dialog";

type CommentAuthor = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Comment = { id: string; chapterIndex: number; parentCommentId: string | null; author: CommentAuthor; body: string; status: "visible" | "deleted" | "hidden"; createdAt: string; upvoteCount: number };
type ViewerState = { upvotedCommentIds: string[]; removableCommentIds: string[] };
const relativeTime = (value: string) => { const delta = Math.max(0, Date.now() - new Date(value).getTime()); const minutes = Math.floor(delta / 60000); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return `${days}d ago`; };

export function CommentThread({ storyId, chapterCount = 1 }: { storyId: string; chapterCount?: number }) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewer, setViewer] = useState<ViewerState>({ upvotedCommentIds: [], removableCommentIds: [] });
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [commentsResponse, viewerResponse] = await Promise.all([
        fetch(`/api/stories/${encodeURIComponent(storyId)}/comments`, { cache: "no-store" }),
        fetch(`/api/stories/${encodeURIComponent(storyId)}/comments/viewer-state`, { cache: "no-store" }),
      ]);
      if (!commentsResponse.ok) throw new Error("comments");
      setComments(((await commentsResponse.json()) as { comments: Comment[] }).comments);
      if (viewerResponse.ok) setViewer((await viewerResponse.json()) as ViewerState);
      setError(null);
    } catch { setError("Comments are temporarily unavailable."); }
    finally { setLoading(false); }
  }, [storyId]);

  useEffect(() => { void load(); }, [load]);
  const goToSignIn = () => router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);

  async function submit(body: string, parentCommentId: string | null) {
    if (!body.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, parentCommentId }) });
      if (response.status === 401) return goToSignIn();
      if (!response.ok) { const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null; setError(payload?.error?.message ?? "Could not post that comment."); return; }
      if (parentCommentId) { setReplyDraft(""); setReplyTo(null); } else setDraft("");
      await load();
    } catch { setError("Could not post that comment. Try again."); }
    finally { setBusy(false); }
  }

  async function toggleUpvote(comment: Comment) {
    const enabled = !viewer.upvotedCommentIds.includes(comment.id);
    const previous = viewer;
    setViewer((current) => ({ ...current, upvotedCommentIds: enabled ? [...current.upvotedCommentIds, comment.id] : current.upvotedCommentIds.filter((id) => id !== comment.id) }));
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, upvoteCount: Math.max(0, item.upvoteCount + (enabled ? 1 : -1)) } : item));
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments/${encodeURIComponent(comment.id)}/upvote`, { method: enabled ? "PUT" : "DELETE" });
      if (response.status === 401) return goToSignIn();
      if (!response.ok) throw new Error("upvote");
      const result = (await response.json()) as { upvoteCount: number; viewerHasUpvoted: boolean };
      setComments((current) => current.map((item) => item.id === comment.id ? { ...item, upvoteCount: result.upvoteCount } : item));
    } catch { setViewer(previous); setComments((current) => current.map((item) => item.id === comment.id ? { ...item, upvoteCount: comment.upvoteCount } : item)); setError("That upvote could not be saved."); }
  }

  async function remove(commentId: string) {
    if (busy) return;
    setBusy(true);
    try { const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" }); if (response.status === 401) return goToSignIn(); if (response.ok) await load(); else setError("That comment could not be removed."); }
    catch { setError("That comment could not be removed."); }
    finally { setBusy(false); }
  }

  const topLevel = comments.filter((comment) => comment.parentCommentId === null);
  const repliesFor = (parentId: string) => comments.filter((comment) => comment.parentCommentId === parentId);
  const form = (value: string, setValue: (next: string) => void, parent: string | null) => <form onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(value, parent); }} className="comment-thread__form"><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={parent ? "Add a thoughtful reply…" : "Share a thought about this build…"} rows={parent ? 2 : 3} maxLength={1000} aria-label={parent ? "Reply" : "Comment"} /><div className="comment-thread__form-footer"><span>{value.length}/1,000</span><button type="submit" className="button button--primary button--small" disabled={busy || !value.trim()}>{busy ? "Posting…" : parent ? "Post reply" : "Post comment"}</button></div></form>;
  const renderComment = (comment: Comment, reply = false) => { const upvoted = viewer.upvotedCommentIds.includes(comment.id); const removed = comment.status !== "visible"; const removedLabel = comment.status === "hidden" ? "This comment was removed by a moderator." : "This comment was removed."; return <article className={`comment-card${reply ? " comment-card--reply" : ""}`} key={comment.id}><div className="comment-card__avatar">{comment.author.displayName.slice(0, 1).toUpperCase()}</div><div className="comment-card__body"><header><div><strong>{removed ? "Deleted comment" : comment.author.displayName}</strong><span>@{comment.author.handle} · {relativeTime(comment.createdAt)}{chapterCount > 1 ? ` · Ch. ${comment.chapterIndex}` : ""}</span></div>{!removed ? <details className="comment-card__menu"><summary aria-label="Comment actions">•••</summary><div><ReportDialog targetType="comment" targetId={comment.id} />{viewer.removableCommentIds.includes(comment.id) ? <button type="button" onClick={() => void remove(comment.id)}>Remove</button> : null}</div></details> : null}</header><p>{removed ? removedLabel : comment.body}</p>{!removed ? <div className="comment-card__actions"><button type="button" onClick={() => void toggleUpvote(comment)} aria-pressed={upvoted} className={upvoted ? "is-active" : ""}>Upvote <strong>{comment.upvoteCount}</strong></button>{!reply ? <button type="button" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>Reply</button> : null}</div> : null}</div></article>; };

  return <section className="comment-thread"><div className="comment-thread__heading"><div><span className="section-index">( COMMUNITY NOTES )</span><h2>Comments <small>{comments.length}</small></h2></div><span>One thoughtful thread at a time.</span></div>{form(draft, setDraft, null)}{error ? <p className="comment-thread__error" role="alert">{error}</p> : null}{loading ? <div className="comment-thread__skeleton" aria-label="Loading comments"><i /><i /><i /></div> : !topLevel.length ? <div className="comment-thread__empty"><strong>Start the conversation</strong><span>Share what stood out in this build.</span></div> : <div className="comment-thread__list">{topLevel.map((comment) => <div key={comment.id}>{renderComment(comment)}{replyTo === comment.id ? <div className="comment-thread__reply-form">{form(replyDraft, setReplyDraft, comment.id)}</div> : null}<div className="comment-thread__replies">{repliesFor(comment.id).map((reply) => renderComment(reply, true))}</div></div>)}</div>}</section>;
}
