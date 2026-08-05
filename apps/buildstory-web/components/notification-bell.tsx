"use client";

import { useEffect, useRef, useState } from "react";

type NotificationActor = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Notification = {
  id: string;
  kind: "follow" | "reaction" | "comment" | "comment_reply";
  actor: NotificationActor;
  reportId: string | null;
  reportSlug: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
};

function describe(notification: Notification): string {
  switch (notification.kind) {
    case "follow":
      return `${notification.actor.displayName} started following you.`;
    case "reaction":
      return `${notification.actor.displayName} reacted to your build story.`;
    case "comment":
      return `${notification.actor.displayName} commented on your build story.`;
    case "comment_reply":
      return `${notification.actor.displayName} replied to your comment.`;
    default:
      return "New activity.";
  }
}

export function NotificationBell() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/creator/notifications", { cache: "no-store" });
    if (response.status === 401) {
      setSignedIn(false);
      return;
    }
    if (!response.ok) return;
    const data = (await response.json()) as { notifications: Notification[]; unreadCount: number };
    setSignedIn(true);
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      await fetch("/api/creator/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setUnreadCount(0);
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    }
  }

  if (!signedIn) return null;

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell__trigger"
        onClick={() => void toggleOpen()}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? <span className="notification-bell__badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-bell__panel" id="notification-panel" role="menu">
          {notifications.length === 0 ? (
            <p className="notification-bell__empty">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id} className={notification.readAt ? undefined : "is-unread"}>
                  {notification.reportSlug ? (
                    <a href={`/p/${notification.reportSlug}`}>{describe(notification)}</a>
                  ) : (
                    <span>{describe(notification)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
