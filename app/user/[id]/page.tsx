"use client";

import Image from "next/image";
import PollCard from "../../components/poll-card";
import LoadingScreen from "../../components/loading-screen";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createBlockedUser,
  listBlockedUsers,
  listMutuallyHiddenUserIds,
  removeBlockedUser,
} from "../../../lib/blocked-users";
import { getProfileIdentity } from "../../../lib/profile-identities";
import { hydratePolls, type PollRecord, type PollWithResults } from "../../../lib/polls";
import { supabase } from "../../../lib/supabase";

type ProfileRecord = {
  id: string;
  user_id?: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const routeUsername = decodeURIComponent(params.id ?? "");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [polls, setPolls] = useState<PollWithResults[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      if (!routeUsername) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      console.log("USER ROUTE PARAM", routeUsername);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerId(user?.id ?? null);

      const profileWithUserIdResult = await supabase
        .from("profiles")
        .select("id, user_id, username, avatar_url, bio")
        .ilike("username", routeUsername)
        .maybeSingle();

      let profileData: ProfileRecord | null =
        (profileWithUserIdResult.data as ProfileRecord | null) ?? null;
      let profileError = profileWithUserIdResult.error;

      if (profileWithUserIdResult.error?.code === "42703") {
        const fallbackProfileResult = await supabase
          .from("profiles")
          .select("id, username, avatar_url, bio")
          .ilike("username", routeUsername)
          .maybeSingle();

        profileData = (fallbackProfileResult.data as ProfileRecord | null) ?? null;
        profileError = fallbackProfileResult.error;
      }

      if (profileError) {
        console.error("Error loading user profile:", profileError);
      }

      console.log("PROFILE QUERY RESULT", profileData);

      if (!profileData?.id) {
        setProfile(null);
        setPolls([]);
        setIsFollowing(false);
        setIsBlocked(false);
        setIsUnavailable(false);
        setIsBlockedByThem(false);
        setIsLoading(false);
        return;
      }

      const profileAuthUserId = getProfileIdentity(profileData) ?? profileData.id;

      const [
        { data: blockedUsersData, error: blockedUsersError },
        { data: mutuallyHiddenUserIds, error: mutuallyHiddenUsersError },
        { data: pollData, error: pollError },
        followRecord,
      ] = await Promise.all([
        user?.id ? listBlockedUsers(supabase, user.id) : Promise.resolve({ data: [], error: null }),
        user?.id
          ? listMutuallyHiddenUserIds(supabase, user.id)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("polls")
          .select(
            "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
          )
          .eq("user_id", profileAuthUserId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(12),
        user?.id
          ? supabase
              .from("user_follows")
              .select("id")
              .eq("follower_id", user.id)
              .eq("following_id", profileAuthUserId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (blockedUsersError) {
        console.error("Error loading blocked users for public profile:", blockedUsersError);
      }

      if (mutuallyHiddenUsersError) {
        console.error(
          "Error loading mutual blocked users for public profile:",
          mutuallyHiddenUsersError
        );
      }

      if (pollError) {
        console.error("Error loading public profile polls:", pollError);
      }

      const blockedIds = new Set(
        ((blockedUsersData ?? []) as { blocked_id: string }[]).map(
          (blockedUser) => blockedUser.blocked_id
        )
      );
      const mutuallyHiddenIds = new Set((mutuallyHiddenUserIds ?? []) as string[]);
      const viewerBlockedProfile = blockedIds.has(profileAuthUserId);
      const profileBlockedViewer =
        Boolean(user?.id) && mutuallyHiddenIds.has(profileAuthUserId) && !viewerBlockedProfile;

      if (user?.id && mutuallyHiddenIds.has(profileAuthUserId)) {
        setProfile(profileData);
        setPolls([]);
        setIsFollowing(false);
        setIsBlocked(viewerBlockedProfile);
        setIsUnavailable(true);
        setIsBlockedByThem(Boolean(profileBlockedViewer));
        setIsLoading(false);
        return;
      }

      setProfile(profileData);
      setPolls(
        pollError
          ? []
          : await hydratePolls(
              supabase,
              ((pollData ?? []) as PollRecord[]),
              user?.id ?? null
            )
      );
      setIsFollowing(Boolean(followRecord?.data?.id));
      setIsBlocked(viewerBlockedProfile);
      setIsUnavailable(false);
      setIsBlockedByThem(false);
      setIsLoading(false);
    }

    void loadUserProfile();
  }, [routeUsername]);

  useEffect(() => {
    if (!profile?.username || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("reflekt:user-title", { detail: `@${profile.username}` }));
  }, [profile?.username]);

  const likesReceived = useMemo(() => polls.reduce((sum, poll) => sum + poll.heartCount, 0), [polls]);
  const displayName = profile?.username ? `@${profile.username}` : "Graffiti user";
  const initials = (profile?.username ?? "G").charAt(0).toUpperCase();
  const profileAuthUserId = getProfileIdentity(profile);
  const followTargetId = profile?.id ?? null;
  const isOwnProfile = Boolean(viewerId && followTargetId && viewerId === followTargetId);
  const blockButtonLabel = !viewerId
    ? "Log in to block users."
    : isBlocked
      ? "Unblock"
      : "Block";
  const isBlockButtonDisabled = Boolean(
    isBlocking || (isUnavailable && !isBlocked) || isBlockedByThem
  );
  const isFollowButtonDisabled = Boolean(
    isFollowLoading || !viewerId || !followTargetId || isOwnProfile || isUnavailable
  );

  const handleBlockToggle = async () => {
    if (!profileAuthUserId || !profile) {
      setMessage({ type: "error", text: "Could not update block status." });
      return;
    }

    if (!viewerId) {
      setMessage({ type: "error", text: "Log in to block users." });
      return;
    }

    if (viewerId === profileAuthUserId) {
      setMessage({ type: "error", text: "You cannot block yourself." });
      return;
    }

    if (isUnavailable && !isBlocked) {
      setMessage({ type: "error", text: "This profile is unavailable." });
      return;
    }

    setIsBlocking(true);
    setMessage(null);

    if (isBlocked) {
      const result = await removeBlockedUser(supabase, viewerId, profileAuthUserId);
      setIsBlocking(false);

      if (result.error) {
        console.error("Error updating block state:", result.error);
        setMessage({
          type: "error",
          text: result.error.message ?? "Could not update block status.",
        });
        return;
      }
    } else {
      const targetProfileResult = await supabase
        .from("profiles")
        .select("id, user_id, username, avatar_url, bio")
        .eq("id", profile.id)
        .maybeSingle();

      let targetProfile = (targetProfileResult.data as ProfileRecord | null) ?? null;
      let targetProfileError = targetProfileResult.error;

      if (targetProfileResult.error?.code === "42703") {
        const fallbackTargetProfileResult = await supabase
          .from("profiles")
          .select("id, username, avatar_url, bio")
          .eq("id", profile.id)
          .maybeSingle();

        targetProfile = (fallbackTargetProfileResult.data as ProfileRecord | null) ?? null;
        targetProfileError = fallbackTargetProfileResult.error;
      }

      if (targetProfileError) {
        setIsBlocking(false);
        console.error("Error loading target profile for blocking:", targetProfileError);
        setMessage({
          type: "error",
          text: targetProfileError.message ?? "Could not block this user.",
        });
        return;
      }

      const targetUserAuthId = getProfileIdentity(targetProfile);

      if (!targetUserAuthId) {
        setIsBlocking(false);
        setMessage({ type: "error", text: "Could not block this user." });
        return;
      }

      const result = await createBlockedUser(
        supabase,
        viewerId,
        targetUserAuthId,
        targetProfile?.username ?? null
      );
      setIsBlocking(false);

      if (result.alreadyExists) {
        setIsBlocked(true);
        setMessage({ type: "success", text: "User already blocked." });
        return;
      }

      if (result.error) {
        console.error("Error updating block state:", result.error);
        setMessage({
          type: "error",
          text: result.error.message ?? "Could not update block status.",
        });
        return;
      }
    }

    setIsBlocked((previous) => !previous);
    setMessage({
      type: "success",
      text: isBlocked ? "User unblocked." : "User blocked.",
    });
  };

  const handleFollowToggle = async () => {
    if (!profileAuthUserId || !profile) {
      return;
    }

    if (!viewerId) {
      setMessage({ type: "error", text: "Log in to follow users." });
      return;
    }

    if (viewerId === followTargetId) {
      setMessage({ type: "error", text: "You cannot follow yourself." });
      return;
    }

    if (isUnavailable) {
      setMessage({ type: "error", text: "This profile is unavailable." });
      return;
    }

    setIsFollowLoading(true);
    setMessage(null);

    if (isFollowing) {
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", viewerId)
        .eq("following_id", followTargetId);

      setIsFollowLoading(false);

      if (error) {
        console.error("Error unfollowing user:", error);
        setMessage({ type: "error", text: error.message ?? "Could not unfollow this user." });
        return;
      }

      setIsFollowing(false);
      setMessage({ type: "success", text: "User unfollowed." });
      return;
    }

    const { error } = await supabase.from("user_follows").insert(
      {
        follower_id: viewerId,
        following_id: followTargetId,
        following_username: profile.username ?? null,
      }
    );

    setIsFollowLoading(false);

    if (error) {
      if (error.code === "23505") {
        setIsFollowing(true);
        setMessage({ type: "success", text: "User followed." });
        return;
      }

      console.error("Error following user:", error);
      setMessage({ type: "error", text: error.message ?? "Could not follow this user." });
      return;
    }

    setIsFollowing(true);
    setMessage({ type: "success", text: "User followed." });
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen label="Loading profile" message="Fetching profile details and recent polls." />
      ) : !profile ? (
        <div className="empty-state">
          <strong>User not found</strong>
          <span>This public Graffiti profile could not be loaded.</span>
        </div>
      ) : (
        <div className="stack user-profile-shell">
          <section className="section-card stack">
            <div className="profile-hero">
              <div className="avatar-shell">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={displayName}
                    width={84}
                    height={84}
                    unoptimized
                    style={{ width: "84px", height: "84px", objectFit: "cover" }}
                  />
                ) : (
                  <span className="avatar-fallback">{initials}</span>
                )}
              </div>

              <div className="profile-meta">
                <div className="profile-meta-row">
                  <h2 className="profile-name">{displayName}</h2>
                  {!isOwnProfile ? (
                    <button
                      className={`button profile-follow-button ${
                        isFollowing ? "button-secondary" : "button-accent"
                      }`}
                      onClick={handleFollowToggle}
                      disabled={isFollowButtonDisabled}
                    >
                      {isFollowLoading
                        ? isFollowing
                          ? "Unfollowing..."
                          : "Following..."
                        : isFollowing
                          ? "Unfollow"
                          : "Follow"}
                    </button>
                  ) : null}
                </div>
                {profile.bio ? <p className="profile-bio-text">{profile.bio}</p> : null}
                <div className="profile-stats-row">
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{polls.length}</span>
                    <span className="profile-stat-label">Polls</span>
                  </div>
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{likesReceived}</span>
                    <span className="profile-stat-label">Hearts Received</span>
                  </div>
                </div>
              </div>
            </div>

            {!isOwnProfile ? (
              <div className="toolbar">
                <button
                  className={`button profile-inline-button ${
                    isBlocked ? "button-secondary" : isUnavailable ? "button-secondary" : "button-accent"
                  }`}
                  onClick={handleBlockToggle}
                  disabled={isBlockButtonDisabled}
                >
                  {isBlocking ? (isBlocked ? "Unblocking..." : "Blocking...") : blockButtonLabel}
                </button>
              </div>
            ) : null}

            {message ? (
              <div
                className={`status-message ${
                  message.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {message.text}
              </div>
            ) : null}
          </section>

          {isUnavailable ? (
            <section className="section-card stack">
              <div className="empty-state">
                <strong>This profile is unavailable.</strong>
                <span>
                  {isBlocked
                    ? "You blocked this user. Unblock them to restore access."
                    : "You cannot view this profile right now."}
                </span>
              </div>
            </section>
          ) : (
            <section className="section-card stack">
              <div className="stack" style={{ gap: "6px" }}>
                <strong className="profile-section-title">Polls</strong>
                <span className="muted">Public polls created across Graffiti.</span>
              </div>

              {polls.length === 0 ? (
                <div className="empty-state">
                  <strong>No polls yet</strong>
                  <span>This user has not created any public polls yet.</span>
                </div>
              ) : (
                <div className="stack">
                  {polls.map((poll) => (
                    <PollCard key={poll.id} poll={poll} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
