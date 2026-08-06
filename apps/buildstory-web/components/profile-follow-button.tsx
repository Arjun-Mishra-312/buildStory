"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileFollowButton({ handle, initialFollowed, isSelf }: { handle: string; initialFollowed: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [followed, setFollowed] = useState(initialFollowed);
  const [busy, setBusy] = useState(false);
  if (isSelf) return null;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const response = await fetch(`/api/users/${encodeURIComponent(handle)}/follow`, { method: followed ? "DELETE" : "POST" });
    if (response.status === 401) router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    else if (response.ok) setFollowed(!followed);
    setBusy(false);
  }
  return <button className={`button button--small ${followed ? "button--secondary" : "button--primary"}`} type="button" onClick={() => void toggle()} disabled={busy}>{followed ? "Following" : `Follow @${handle}`}</button>;
}
