"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../components/loading-screen";
import { supabase } from "../../lib/supabase";

type NotificationRow = {
  id: number;
  recipient_user_id: string;
  actor_user_id: string;
  type: "comment_like" | "comment_reply";
  article_id: number | null;
  comment_id: number | null;
  reply_id: number | null;
  read_at: string | null;
  created_at: string;
};

type ActorProfile = {
  id: string;
  username: string | null;
};

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Just now";
  }

  const createdAt = new Date(timestamp).getTime();

  if (Number.isNaN(createdAt)) {
    return "Just now";
  }

  const diffMs = Date.now() - createdAt;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [actors, setActors] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadNotifications() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setNotifications([]);
        setActors({});
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, recipient_user_id, actor_user_id, type, article_id, comment_id, reply_id, read_at, created_at"
        )
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading notifications:", error);
        setNotifications([]);
        setActors({});
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as NotificationRow[];
      setNotifications(rows);

      const actorIds = [...new Set(rows.map((row) => row.actor_user_id))];

      if (actorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", actorIds);

        const actorProfiles = (profilesData ?? []) as ActorProfile[];
        setActors(
          Object.fromEntries(actorProfiles.map((profile) => [profile.id, profile.username]))
        );
      } else {
        setActors({});
      }

      const unreadIds = rows.filter((row) => row.read_at === null).map((row) => row.id);

      if (unreadIds.length > 0) {
        const readAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ read_at: readAt })
          .in("id", unreadIds)
          .eq("recipient_user_id", user.id);

        if (updateError) {
          console.error("Error marking notifications as read:", updateError);
        } else {
          setNotifications((prev) =>
            prev.map((notification) =>
              unreadIds.includes(notification.id)
                ? { ...notification, read_at: readAt }
                : notification
            )
          );
        }
      }

      setIsLoading(false);
    }

    void loadNotifications();
  }, []);

  const notificationItems = useMemo(
    () =>
      notifications.map((notification) => {
        const actorName = actors[notification.actor_user_id] ?? "Someone";

        return {
          ...notification,
          icon: notification.type === "comment_like" ? "♥" : "↩",
          message:
            notification.type === "comment_like"
              ? `${actorName} liked your comment`
              : `${actorName} replied to your comment`,
        };
      }),
    [actors, notifications]
  );

  const handleOpenNotification = async (notification: NotificationRow) => {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", notification.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((current) =>
            current.id === notification.id ? { ...current, read_at: readAt } : current
          )
        );
      }
    }
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : notificationItems.length === 0 ? (
        <div className="empty-state">
          <strong>No notifications yet</strong>
          <span>When readers like or reply to your comments, they’ll show up here.</span>
        </div>
      ) : (
        <div className="notifications-list">
          {notificationItems.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={`notifications-row ${
                notification.read_at ? "" : "notifications-row-unread"
              }`}
              onClick={() => void handleOpenNotification(notification)}
            >
              <span className="notifications-icon" aria-hidden="true">
                {notification.icon}
              </span>
              <span className="notifications-copy">
                <strong>{notification.message}</strong>
                <span>{formatRelativeTime(notification.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
