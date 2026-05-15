"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { fetchProfilesByIdentity, getProfileIdentity } from "../../../lib/profile-identities";
import { supabase } from "../../../lib/supabase";

type FollowRow = {
  id: string;
  following_id: string;
  following_username: string | null;
};

type DbProfile = {
  id: string;
  user_id?: string | null;
  username: string | null;
  avatar_url: string | null;
};

type FollowingUser = {
  followId: string;
  followingId: string;
  username: string | null;
  avatarUrl: string | null;
};

export default function ProfileFollowingPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeUnfollowId, setActiveUnfollowId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadFollowing() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);

      if (!user?.id) {
        setFollowingUsers([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_follows")
        .select("id, following_id, following_username")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading following:", error);
        setMessage(error.message ?? "Could not load following.");
        setFollowingUsers([]);
        setIsLoading(false);
        return;
      }

      const followRows = ((data ?? []) as FollowRow[]).filter(
        (row) => row.following_id && row.following_id !== user.id
      );

      if (followRows.length === 0) {
        setFollowingUsers([]);
        setIsLoading(false);
        return;
      }

      const { data: profilesData, error: profilesError } = await fetchProfilesByIdentity<DbProfile>(
        supabase,
        followRows.map((row) => row.following_id),
        "id, user_id, username, avatar_url"
      );

      if (profilesError) {
        console.error("Error loading followed profiles:", profilesError);
      }

      const profileLookup = new Map(
        ((profilesData ?? []) as DbProfile[]).map((profile) => [
          getProfileIdentity(profile) ?? profile.id,
          profile,
        ])
      );

      setFollowingUsers(
        followRows.map((row) => {
          const profile = profileLookup.get(row.following_id);
          return {
            followId: row.id,
            followingId: row.following_id,
            username: profile?.username ?? row.following_username ?? null,
            avatarUrl: profile?.avatar_url ?? null,
          };
        })
      );
      setIsLoading(false);
    }

    void loadFollowing();
  }, []);

  const handleUnfollow = async (followedUserId: string) => {
    if (!currentUserId) {
      setMessage("Log in to manage following.");
      return;
    }

    setActiveUnfollowId(followedUserId);

    const { error } = await supabase
      .from("user_follows")
      .delete()
      .eq("follower_id", currentUserId)
      .eq("following_id", followedUserId);

    setActiveUnfollowId(null);

    if (error) {
      console.error("Error unfollowing user:", error);
      setMessage(error.message ?? "Could not unfollow this user.");
      return;
    }

    setFollowingUsers((prev) =>
      prev.filter((user) => user.followingId !== followedUserId)
    );
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen label="Loading following" message="Fetching the people you follow." />
      ) : !currentUserId ? (
        <div className="empty-state">
          <strong>Log in to view following</strong>
          <span>Your followed users will appear here.</span>
        </div>
      ) : followingUsers.length === 0 ? (
        <div className="empty-state">
          <strong>Not following anyone yet</strong>
          <span>Follow people from public profiles to build this list.</span>
        </div>
      ) : (
        <div className="settings-sublist">
          {followingUsers.map((followedUser) => (
            <div key={followedUser.followingId} className="settings-subrow">
              <Link
                href={`/user/${encodeURIComponent(followedUser.username ?? followedUser.followingId)}/`}
                className="settings-blocked-user"
              >
                <span className="avatar-shell settings-blocked-user-avatar">
                  {followedUser.avatarUrl ? (
                    <Image
                      src={followedUser.avatarUrl}
                      alt={followedUser.username ?? "Followed user avatar"}
                      width={48}
                      height={48}
                      unoptimized
                      className="source-avatar-image"
                    />
                  ) : (
                    <span className="avatar-fallback">
                      {(followedUser.username ?? "G").charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="settings-list-copy">
                  <strong>
                    {followedUser.username ? `@${followedUser.username}` : "Graffiti user"}
                  </strong>
                  <span>Public profile</span>
                </div>
              </Link>
              <button
                className="comment-action"
                onClick={() => handleUnfollow(followedUser.followingId)}
                disabled={activeUnfollowId === followedUser.followingId}
              >
                {activeUnfollowId === followedUser.followingId ? "Unfollowing..." : "Unfollow"}
              </button>
            </div>
          ))}
          {message ? <div className="status-message status-error">{message}</div> : null}
        </div>
      )}
    </section>
  );
}
