"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createBlockedUser,
  listBlockedUsers,
  listMutuallyHiddenUserIds,
  removeBlockedUser,
} from "../../../lib/blocked-users";
import { extractVideoIdFromUrl } from "../../../lib/video-feed";
import { supabase } from "../../../lib/supabase";

type ProfileRecord = {
  id: string;
  user_id?: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type ProfileQueryResult = {
  data: ProfileRecord | null;
  error: { message?: string; code?: string } | null;
};

type DbComment = {
  id: number;
  article_id: number | string | null;
  article_title: string | null;
  article_url: string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbCommentReaction = {
  comment_id: number;
  reaction_type: "like" | "dislike";
};

type PublicComment = DbComment & {
  hearts: number;
};

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Recent";
  }

  const parsed = new Date(timestamp).getTime();

  if (Number.isNaN(parsed)) {
    return "Recent";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}d ago`;
}

async function loadProfileByIdentifier(identifier: string): Promise<ProfileQueryResult> {
  const usernameResult = await supabase
    .from("profiles")
    .select("id, user_id, username, avatar_url, bio")
    .ilike("username", identifier)
    .maybeSingle();

  if (!usernameResult.error || usernameResult.error.code !== "42703") {
    return {
      data: (usernameResult.data as ProfileRecord | null) ?? null,
      error: usernameResult.error,
    };
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select("id, username, avatar_url, bio")
    .ilike("username", identifier)
    .maybeSingle();

  return {
    data: (fallbackResult.data as ProfileRecord | null) ?? null,
    error: fallbackResult.error,
  };
}

async function loadProfileById(profileId: string): Promise<ProfileQueryResult> {
  const idResult = await supabase
    .from("profiles")
    .select("id, user_id, username, avatar_url, bio")
    .eq("id", profileId)
    .maybeSingle();

  if (!idResult.error || idResult.error.code !== "42703") {
    return {
      data: (idResult.data as ProfileRecord | null) ?? null,
      error: idResult.error,
    };
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select("id, username, avatar_url, bio")
    .eq("id", profileId)
    .maybeSingle();

  return {
    data: (fallbackResult.data as ProfileRecord | null) ?? null,
    error: fallbackResult.error,
  };
}

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const routeIdentifier = decodeURIComponent(params.id ?? "");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocking, setIsBlocking] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      if (!routeIdentifier) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerId(user?.id ?? null);

      let profileData: ProfileRecord | null = null;

      const { data: usernameProfile, error: usernameProfileError } =
        await loadProfileByIdentifier(routeIdentifier);

      if (usernameProfileError) {
        console.error("Error loading user profile by username:", usernameProfileError);
      }

      profileData = (usernameProfile ?? null) as ProfileRecord | null;

      if (!profileData) {
        const { data: idProfile, error: idProfileError } = await loadProfileById(routeIdentifier);

        if (idProfileError) {
          console.error("Error loading user profile by id:", idProfileError);
        }

        profileData = (idProfile ?? null) as ProfileRecord | null;
      }

      if (!profileData?.id) {
        setProfile(null);
        setComments([]);
        setIsBlocked(false);
        setIsUnavailable(false);
        setIsBlockedByThem(false);
        setIsLoading(false);
        return;
      }

      const profileAuthUserId = profileData.user_id ?? profileData.id;

      const [
        { data: blockedUsersData, error: blockedUsersError },
        { data: mutuallyHiddenUserIds, error: mutuallyHiddenUsersError },
        { data: commentData, error: commentError },
      ] = await Promise.all([
          user?.id ? listBlockedUsers(supabase, user.id) : Promise.resolve({ data: [], error: null }),
          user?.id
            ? listMutuallyHiddenUserIds(supabase, user.id)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("comments")
            .select(
              "id, article_id, article_title, article_url, text, username, user_id, created_at"
            )
            .eq("user_id", profileAuthUserId)
            .order("created_at", { ascending: false }),
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

      if (commentError) {
        console.error("Error loading public profile comments:", commentError);
      }

      const rawComments = (commentData ?? []) as DbComment[];
      const commentIds = rawComments.map((comment) => comment.id);

      const { data: reactionData, error: reactionError } =
        commentIds.length > 0
          ? await supabase
              .from("comment_reactions")
              .select("comment_id, reaction_type")
              .in("comment_id", commentIds)
          : { data: [] as DbCommentReaction[], error: null };

      if (reactionError) {
        console.error("Error loading public profile comment reactions:", reactionError);
      }

      const heartCounts = new Map<number, number>();
      ((reactionData ?? []) as DbCommentReaction[]).forEach((reaction) => {
        if (reaction.reaction_type !== "like") {
          return;
        }

        heartCounts.set(reaction.comment_id, (heartCounts.get(reaction.comment_id) ?? 0) + 1);
      });

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
        setComments([]);
        setIsBlocked(viewerBlockedProfile);
        setIsUnavailable(true);
        setIsBlockedByThem(Boolean(profileBlockedViewer));
        setIsLoading(false);
        return;
      }

      setProfile(profileData);
      setComments(
        rawComments.map((comment) => ({
          ...comment,
          hearts: heartCounts.get(comment.id) ?? 0,
        }))
      );
      setIsBlocked(viewerBlockedProfile);
      setIsUnavailable(false);
      setIsBlockedByThem(false);
      setIsLoading(false);
    }

    void loadUserProfile();
  }, [routeIdentifier]);

  useEffect(() => {
    if (!profile?.username || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("reflekt:user-title", { detail: `@${profile.username}` }));
  }, [profile?.username]);

  const likesReceived = useMemo(
    () => comments.reduce((sum, comment) => sum + comment.hearts, 0),
    [comments]
  );

  const displayName = profile?.username ? `@${profile.username}` : "Graffiti user";
  const initials = (profile?.username ?? "G").charAt(0).toUpperCase();
  const profileAuthUserId = profile?.user_id ?? profile?.id ?? null;
  const isOwnProfile = Boolean(viewerId && profileAuthUserId && viewerId === profileAuthUserId);
  const blockButtonLabel = !viewerId
    ? "Log in to block users."
    : isBlocked
      ? "Unblock"
      : "Block";
  const isBlockButtonDisabled = Boolean(
    isBlocking || (isUnavailable && !isBlocked) || isBlockedByThem
  );

  const handleBlockToggle = async () => {
    if (!profileAuthUserId || !profile) {
      return;
    }

    if (!viewerId) {
      setMessage({
        type: "error",
        text: "Log in to block users.",
      });
      return;
    }

    if (viewerId === profileAuthUserId) {
      setMessage({
        type: "error",
        text: "You cannot block yourself.",
      });
      return;
    }

    if (isUnavailable && !isBlocked) {
      setMessage({
        type: "error",
        text: "This profile is unavailable.",
      });
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
      const { data: targetProfile, error: targetProfileError } =
        await loadProfileById(profile.id);

      if (targetProfileError) {
        setIsBlocking(false);
        console.error("Error loading target profile for blocking:", targetProfileError);
        setMessage({
          type: "error",
          text: targetProfileError.message ?? "Could not block this user.",
        });
        return;
      }

      const targetUserAuthId = targetProfile?.user_id ?? targetProfile?.id ?? null;

      console.log("BLOCK CURRENT USER ID", viewerId);
      console.log("BLOCK TARGET PROFILE", targetProfile);
      console.log("BLOCK TARGET AUTH ID", targetUserAuthId);

      if (!targetUserAuthId) {
        setIsBlocking(false);
        setMessage({
          type: "error",
          text: "Could not block this user.",
        });
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
        setMessage({
          type: "success",
          text: "User already blocked.",
        });
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

  return (
    <section className="page-shell">
      {isLoading ? (
        <div className="loading-state">
          <strong>Loading profile</strong>
          <span>Fetching profile details and recent comments.</span>
        </div>
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
                    style={{
                      width: "84px",
                      height: "84px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span className="avatar-fallback">{initials}</span>
                )}
              </div>

              <div className="profile-meta">
                <h2 className="profile-name">{displayName}</h2>
                {profile.bio ? <p className="profile-bio-text">{profile.bio}</p> : null}
                <div className="profile-stats-row">
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{comments.length}</span>
                    <span className="profile-stat-label">Comments</span>
                  </div>
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{likesReceived}</span>
                    <span className="profile-stat-label">Likes Received</span>
                  </div>
                </div>
              </div>
            </div>

            {!isOwnProfile ? (
              <div className="toolbar">
                <button
                  className={`button ${
                    isBlocked ? "button-secondary" : isUnavailable ? "button-secondary" : "button-accent"
                  }`}
                  onClick={handleBlockToggle}
                  disabled={isBlockButtonDisabled}
                >
                  {isBlocking
                    ? isBlocked
                      ? "Unblocking..."
                      : "Blocking..."
                    : blockButtonLabel}
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
                <strong className="profile-section-title">Recent comments</strong>
                <span className="muted">Public comments posted across Graffiti.</span>
              </div>

              {comments.length === 0 ? (
                <div className="empty-state">
                  <strong>No comments yet</strong>
                  <span>This user has not posted any comments yet.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {comments.map((comment) => {
                    const videoId = extractVideoIdFromUrl(comment.article_url);
                    const commentHref = videoId
                      ? `/video/${videoId}#comment-${comment.id}`
                      : comment.article_id
                        ? `/article/${comment.article_id}#comment-${comment.id}`
                        : "/";

                    return (
                      <Link key={comment.id} href={commentHref} className="comment-card user-comment-card">
                        <strong className="profile-comment-article-title">
                          {comment.article_title?.trim() || "Article"}
                        </strong>
                        <div className="user-comment-meta">
                          <strong>{displayName}</strong>
                          <span className="comment-header-time">
                            {formatRelativeTime(comment.created_at)}
                          </span>
                        </div>
                        <p className="comment-body">{comment.text}</p>
                        <div className="profile-comment-reaction-summary">
                          <span className="profile-comment-reaction-item">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill={comment.hearts > 0 ? "currentColor" : "none"}
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m12 20.8-.8-.7C6 15.5 3 12.7 3 9.3 3 6.8 5 5 7.6 5c1.5 0 2.9.7 3.8 1.9C12.3 5.7 13.7 5 15.2 5 17.9 5 20 6.8 20 9.3c0 3.4-3 6.2-8.2 10.8l-.8.7Z" />
                            </svg>
                            <span>{comment.hearts}</span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
