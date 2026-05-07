"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { listBlockedUsers, removeBlockedUser } from "../../../lib/blocked-users";
import { supabase } from "../../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

type BlockedUserRecord = {
  id: number;
  blocked_id: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type DbBlockedUser = {
  id: number;
  blocked_id: string;
  created_at: string;
  blocked_username: string | null;
};

type DbProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export default function SettingsBlockedUsersPage() {
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRecord[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeBlockedUserId, setActiveBlockedUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadBlockedUsers() {
      setIsLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });

      if (!user?.id) {
        setBlockedUsers([]);
        setIsLoading(false);
        return;
      }

      const { data: blockedUsersData, error: blockedUsersError } = await listBlockedUsers(
        supabase,
        user.id
      );

      if (blockedUsersError) {
        console.error("Error loading blocked users:", blockedUsersError);
        setMessage(blockedUsersError.message ?? "Could not load blocked users.");
        setBlockedUsers([]);
        setIsLoading(false);
        return;
      }

      const blockedRecords = (blockedUsersData ?? []) as DbBlockedUser[];

      if (blockedRecords.length === 0) {
        setBlockedUsers([]);
        setIsLoading(false);
        return;
      }

      const blockedUserIds = blockedRecords.map((blockedUser) => blockedUser.blocked_id);
      const { data: blockedProfilesData, error: blockedProfilesError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", blockedUserIds);

      if (blockedProfilesError) {
        console.error("Error loading blocked user profiles:", blockedProfilesError);
      }

      const blockedProfiles = (blockedProfilesData ?? []) as DbProfile[];
      const profileLookup = new Map(
        blockedProfiles.map((profile) => [
          profile.id,
          {
            username: profile.username,
            avatar_url: profile.avatar_url,
          },
        ])
      );

      setBlockedUsers(
        blockedRecords.map((blockedUser) => ({
          ...blockedUser,
          username:
            blockedUser.blocked_username ??
            profileLookup.get(blockedUser.blocked_id)?.username ??
            null,
          avatar_url: profileLookup.get(blockedUser.blocked_id)?.avatar_url ?? null,
        }))
      );
      setIsLoading(false);
    }

    void loadBlockedUsers();
  }, []);

  const handleUnblockUser = async (blockedUserId: string) => {
    if (!currentUser?.id) {
      setMessage("Log in to manage blocked users.");
      return;
    }

    setActiveBlockedUserId(blockedUserId);

    const { error } = await removeBlockedUser(supabase, currentUser.id, blockedUserId);

    setActiveBlockedUserId(null);

    if (error) {
      console.error("Error unblocking user:", error);
      setMessage(error.message ?? "Could not unblock that user.");
      return;
    }

    setBlockedUsers((prev) =>
      prev.filter((blockedUser) => blockedUser.blocked_id !== blockedUserId)
    );
    setMessage("Blocked user removed.");
  };

  const formatBlockedDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="stack settings-detail-shell">
          <section className="section-card stack">
            {!currentUser?.id ? (
              <div className="status-message status-error">Log in to view blocked users.</div>
            ) : blockedUsers.length === 0 ? (
              <div className="settings-empty-state">You have not blocked anyone.</div>
            ) : (
              <div className="settings-sublist">
                {blockedUsers.map((blockedUser) => (
                  <div key={blockedUser.id} className="settings-subrow">
                    <div className="settings-blocked-user">
                      <span className="avatar-shell settings-blocked-user-avatar">
                        {blockedUser.avatar_url ? (
                          <Image
                            src={blockedUser.avatar_url}
                            alt={blockedUser.username ?? "Blocked user avatar"}
                            width={48}
                            height={48}
                            unoptimized
                            className="source-avatar-image"
                          />
                        ) : (
                          <span className="avatar-fallback">
                            {(blockedUser.username ?? "G").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>

                      <div className="settings-list-copy">
                        <strong>
                          {blockedUser.username
                            ? `@${blockedUser.username}`
                            : "Blocked account"}
                        </strong>
                        <span>Blocked on {formatBlockedDate(blockedUser.created_at)}</span>
                      </div>
                    </div>
                    <button
                      className="comment-action"
                      onClick={() => handleUnblockUser(blockedUser.blocked_id)}
                      disabled={activeBlockedUserId === blockedUser.blocked_id}
                    >
                      {activeBlockedUserId === blockedUser.blocked_id
                        ? "Unblocking..."
                        : "Unblock"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {message ? <div className="status-message status-success">{message}</div> : null}
          </section>
        </div>
      )}
    </section>
  );
}
