"use client";

import { useState } from "react";

type Role = "member" | "moderator" | "admin";

export function AdminUserPanel() {
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const trimmed = handle.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(trimmed)}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessage(payload?.error?.message ?? "That role change could not be saved.");
        return;
      }
      const result = (await response.json()) as { user: { handle: string; role: string } };
      setMessage(`@${result.user.handle} is now ${result.user.role}.`);
    } catch {
      setMessage("That role change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-user-panel">
      <label>
        Handle
        <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="builder-handle" maxLength={40} />
      </label>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="member">Member</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {message ? <p className="admin-user-panel__message">{message}</p> : null}
      <button type="button" className="button button--primary button--small" onClick={() => void submit()} disabled={busy || !handle.trim()}>
        {busy ? "Saving…" : "Set role"}
      </button>
    </div>
  );
}
