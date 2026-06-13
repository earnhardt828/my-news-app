"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import HeartIcon from "../../components/heart-icon";
import LoadingScreen from "../../components/loading-screen";
import ShareButton from "../../components/share-button";
import SourceBadge from "../../components/source-badge";
import { apiFetch, isNativeCapacitorRuntime } from "../../../lib/api-base";
import { listMutuallyHiddenUserIds } from "../../../lib/blocked-users";
import { openOriginalArticleUrl } from "../../../lib/open-article";
import {
  buildVideoEmbedUrl,
  formatVideoPublishedDate,
  getVideoCommentArticleId,
  initialVideos,
  normalizeVideoFeedItems,
  type VideoApiItem,
  type VideoItem,
} from "../../../lib/video-feed";
import { isCommentAllowed } from "../../../lib/moderation";
import { supabase } from "../../../lib/supabase";

type VideoComment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url: string | null;
  likes: number;
  currentUserReaction: "like" | null;
  replies: VideoCommentReply[];
};

type VideoCommentReply = {
  id: number;
  comment_id: number;
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

type DbComment = {
  id: number;
  article_id: number | string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbCommentReaction = {
  id: number;
  comment_id: number;
  user_id: string;
  reaction_type: "like" | "dislike";
};

type DbCommentReply = {
  id: number;
  comment_id: number;
  article_id: number | string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbProfile = {
  id: string;
  avatar_url: string | null;
};

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
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

function normalizeArticleId(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

export default function VideoDetailPage() {
  const params = useParams<{ id?: string }>();
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const isNativeCapacitor = isNativeCapacitorRuntime();
  const videoId = decodeURIComponent(params?.id ?? "");
  const commentArticleId = getVideoCommentArticleId(videoId);
  const commentsSectionRef = useRef<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    commentId: number;
    username: string | null;
  } | null>(null);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [commentActionTarget, setCommentActionTarget] = useState<VideoComment | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    setEmbedLoaded(false);
    setEmbedFailed(false);
  }, [video?.id]);

  useEffect(() => {
    if (!video || video.fallback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!embedLoaded) {
        setEmbedFailed(true);
      }
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [embedLoaded, video]);

  useEffect(() => {
    let isMounted = true;

    async function loadVideoAndComments() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      setUserId(user?.id ?? null);
      setUsername(user?.user_metadata?.username ?? null);

      const [videosRes, commentsRes, reactionsRes, repliesRes, profilesRes] =
        await Promise.allSettled([
          apiFetch("/api/videos"),
          supabase
            .from("comments")
            .select("id, article_id, user_id, username, text, created_at")
            .eq("article_id", commentArticleId)
            .order("created_at", { ascending: false }),
          supabase
            .from("comment_reactions")
            .select("id, comment_id, user_id, reaction_type"),
          supabase
            .from("comment_replies")
            .select("id, comment_id, article_id, text, username, user_id, created_at")
            .eq("article_id", commentArticleId)
            .order("created_at", { ascending: true }),
          supabase.from("profiles").select("id, avatar_url"),
        ]);

      if (!isMounted) {
        return;
      }

      const videoItems =
        videosRes.status === "fulfilled" && videosRes.value.ok
          ? normalizeVideoFeedItems(
              ((await videosRes.value.json()) as { videos?: VideoApiItem[] }).videos
            )
          : initialVideos;
      const matchedVideo =
        videoItems.find((item) => item.id === videoId || item.youtubeId === videoId) ?? null;

      setVideo(matchedVideo);
      setLiked(matchedVideo?.liked ?? false);
      setSaved(matchedVideo?.saved ?? false);
      setLikesCount(matchedVideo?.likes ?? 0);

      if (commentsRes.status === "rejected" || commentsRes.value.error) {
        console.error(
          "Error loading video comments:",
          commentsRes.status === "rejected" ? commentsRes.reason : commentsRes.value.error
        );
        setComments([]);
        setIsLoading(false);
        return;
      }

      const commentRows = (commentsRes.value.data ?? []) as DbComment[];
      const reactionRows =
        reactionsRes.status === "fulfilled" && !reactionsRes.value.error
          ? ((reactionsRes.value.data ?? []) as DbCommentReaction[])
          : [];
      const replyRows =
        repliesRes.status === "fulfilled" && !repliesRes.value.error
          ? ((repliesRes.value.data ?? []) as DbCommentReply[])
          : [];
      const profileRows =
        profilesRes.status === "fulfilled" && !profilesRes.value.error
          ? ((profilesRes.value.data ?? []) as DbProfile[])
          : [];
      const { data: hiddenUserIds, error: hiddenUsersError } = user?.id
        ? await listMutuallyHiddenUserIds(supabase, user.id)
        : { data: [] as string[], error: null };

      if (hiddenUsersError) {
        console.error("Error loading blocked users for video comments:", hiddenUsersError);
      }

      const hiddenIds = new Set((hiddenUserIds ?? []) as string[]);

      const avatarLookup = new Map(profileRows.map((profile) => [profile.id, profile.avatar_url]));

      const mappedComments = commentRows
        .filter(
          (comment) =>
            normalizeArticleId(comment.article_id) === commentArticleId &&
            (!comment.user_id || !hiddenIds.has(comment.user_id))
        )
        .map((comment) => {
          const commentReplies = replyRows
            .filter(
              (reply) =>
                reply.comment_id === comment.id &&
                normalizeArticleId(reply.article_id) === commentArticleId &&
                (!reply.user_id || !hiddenIds.has(reply.user_id))
            )
            .map((reply) => ({
              id: reply.id,
              comment_id: reply.comment_id,
              article_id: normalizeArticleId(reply.article_id) ?? commentArticleId,
              text: reply.text,
              username: reply.username,
              user_id: reply.user_id,
              created_at: reply.created_at,
              avatar_url: reply.user_id ? avatarLookup.get(reply.user_id) ?? null : null,
            }));

          const hearts = reactionRows.filter(
            (reaction) =>
              reaction.comment_id === comment.id && reaction.reaction_type === "like"
          );

          return {
            id: comment.id,
            text: comment.text,
            username: comment.username,
            user_id: comment.user_id,
            created_at: comment.created_at,
            avatar_url: comment.user_id ? avatarLookup.get(comment.user_id) ?? null : null,
            likes: hearts.length,
            currentUserReaction:
              hearts.find((reaction) => reaction.user_id === user?.id) ? "like" : null,
            replies: commentReplies,
          } satisfies VideoComment;
        });

      setComments(mappedComments);
      setIsLoading(false);
    }

    void loadVideoAndComments();

    return () => {
      isMounted = false;
    };
  }, [commentArticleId, videoId]);

  useEffect(() => {
    if (!video?.creator) {
      return;
    }

    window.dispatchEvent(new CustomEvent("reflekt:video-source", { detail: video.creator }));
  }, [video?.creator]);

  useEffect(() => {
    const hash = window.location.hash;

    if (hash === "#comments") {
      commentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        commentInputRef.current?.focus();
      }, 220);
      return;
    }

    if (!hash.startsWith("#comment-")) {
      return;
    }

    window.setTimeout(() => {
      const target = document.querySelector(hash);

      if (!(target instanceof HTMLElement)) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("comment-thread-row-highlight");
      window.setTimeout(() => {
        target.classList.remove("comment-thread-row-highlight");
      }, 1800);
    }, 220);
  }, [comments]);

  const displayedComments = useMemo(
    () =>
      [...comments].sort((a, b) => {
        if (b.likes !== a.likes) {
          return b.likes - a.likes;
        }

        return (
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
      }),
    [comments]
  );

  const handleToggleCommentReaction = async (commentId: number) => {
    if (!userId) {
      alert("Log in to react to comments");
      return;
    }

    const comment = comments.find((entry) => entry.id === commentId);

    if (!comment) {
      return;
    }

    setActiveCommentAction(`reaction-${commentId}`);

    const { data: existing } = await supabase
      .from("comment_reactions")
      .select("id, reaction_type")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.reaction_type === "like") {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error removing video comment heart:", error);
        return;
      }

      setComments((prev) =>
        prev.map((entry) =>
          entry.id === commentId
            ? {
                ...entry,
                likes: Math.max(0, entry.likes - 1),
                currentUserReaction: null,
              }
            : entry
        )
      );
      return;
    }

    if (existing) {
      const { error } = await supabase
        .from("comment_reactions")
        .update({ reaction_type: "like" })
        .eq("id", existing.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error updating video comment reaction:", error);
        return;
      }
    } else {
      const { error } = await supabase.from("comment_reactions").insert({
        comment_id: commentId,
        user_id: userId,
        reaction_type: "like",
      });

      setActiveCommentAction(null);

      if (error) {
        console.error("Error saving video comment reaction:", error);
        return;
      }
    }

    setComments((prev) =>
      prev.map((entry) =>
        entry.id === commentId
          ? {
              ...entry,
              likes: entry.currentUserReaction === "like" ? entry.likes : entry.likes + 1,
              currentUserReaction: "like",
            }
          : entry
      )
    );
  };

  const handleAddComment = async () => {
    const text = commentInput.trim();

    if (!text) {
      return;
    }

    if (!userId) {
      alert("Log in to comment.");
      return;
    }

    if (!video) {
      return;
    }

    if (!isCommentAllowed(text)) {
      alert("Please edit your comment before posting.");
      return;
    }

    if (replyTarget) {
      const { data, error } = await supabase
        .from("comment_replies")
        .insert({
          comment_id: replyTarget.commentId,
          article_id: commentArticleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving video reply:", error);
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === replyTarget.commentId
            ? {
                ...comment,
                replies: [
                  ...comment.replies,
                  {
                    id: data.id,
                    comment_id: data.comment_id,
                    article_id: normalizeArticleId(data.article_id) ?? commentArticleId,
                    text: data.text,
                    username: data.username,
                    user_id: data.user_id,
                    created_at: data.created_at,
                    avatar_url: null,
                  },
                ],
              }
            : comment
        )
      );
      setCommentInput("");
      setReplyTarget(null);
      return;
    }

    const payload = {
      article_id: commentArticleId,
      article_title: video.title,
      article_source: video.creator,
      article_image: video.thumbnailUrl ?? null,
      article_url: video.watchUrl,
      text,
      user_id: userId,
      username,
    };

    let insertResponse = await supabase.from("comments").insert(payload).select().single();

    if (
      insertResponse.error &&
      isMissingCommentMetadataColumnError(insertResponse.error.message)
    ) {
      console.error(
        "Video comment insert failed with article metadata payload, retrying without optional columns:",
        insertResponse.error
      );

      insertResponse = await supabase
        .from("comments")
        .insert({
          article_id: commentArticleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();
    }

    const { data, error } = insertResponse;

    if (error) {
      console.error("Error saving video comment:", error);
      return;
    }

    setComments((prev) => [
      {
        id: data.id,
        text: data.text,
        username: data.username,
        user_id: data.user_id,
        created_at: data.created_at,
        avatar_url: null,
        likes: 0,
        currentUserReaction: null,
        replies: [],
      },
      ...prev,
    ]);
    setCommentInput("");
  };

  const handleDeleteComment = async () => {
    if (!userId || deleteCommentId === null) {
      return;
    }

    setActiveCommentAction(`delete-${deleteCommentId}`);
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", deleteCommentId)
      .eq("user_id", userId);
    setActiveCommentAction(null);

    if (error) {
      console.error("Error deleting video comment:", error);
      return;
    }

    setComments((prev) => prev.filter((comment) => comment.id !== deleteCommentId));
    setDeleteCommentId(null);
    setCommentActionTarget(null);
  };

  const handleReportComment = async () => {
    if (!userId || reportingCommentId === null) {
      return;
    }

    const trimmedReason = reportReason.trim();

    if (!trimmedReason) {
      setReportStatus({
        type: "error",
        text: "Add a short reason before reporting.",
      });
      return;
    }

    setActiveCommentAction(`report-${reportingCommentId}`);
    setReportStatus(null);

    const { error } = await supabase.from("reports").insert({
      comment_id: reportingCommentId,
      user_id: userId,
      reason: trimmedReason,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error reporting video comment:", error);
      setReportStatus({
        type: "error",
        text: "Could not submit report. Please try again.",
      });
      return;
    }

    setReportStatus({
      type: "success",
      text: "Report submitted successfully.",
    });
    setReportReason("");
    window.setTimeout(() => {
      setReportingCommentId(null);
      setReportStatus(null);
      setCommentActionTarget(null);
    }, 1200);
  };

  const startCommentLongPress = (comment: VideoComment) => {
    window.clearTimeout(longPressTimerRef.current ?? undefined);
    longPressTimerRef.current = window.setTimeout(() => {
      setCommentActionTarget(comment);
    }, 420);
  };

  const clearCommentLongPress = () => {
    window.clearTimeout(longPressTimerRef.current ?? undefined);
  };

  const scrollToComments = () => {
    commentsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      commentInputRef.current?.focus();
    }, 220);
  };

  if (isLoading) {
    return <LoadingScreen label="Loading video" />;
  }

  if (!video) {
    return (
      <section className="page-shell">
        <div className="empty-state">
          <strong>Video not found</strong>
          <span>This video is unavailable or could not be loaded.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell article-page-shell video-detail-page-shell">
      <section className="section-card article-detail-hero video-detail-hero">
        <div className="stack" style={{ gap: "10px" }}>
          <div className="article-detail-kicker-row">
            <div className="article-detail-source-wrap">
              <SourceBadge sourceName={video.creator} />
              <span className="article-detail-source">{video.creator}</span>
            </div>
            <span className="chip chip-accent">{video.category}</span>
          </div>
          <h2 className="article-detail-title video-detail-title">{video.title}</h2>
          <p className="article-detail-byline">
            Published {formatVideoPublishedDate(video.publishedAt)}
          </p>
        </div>

        <div className="video-detail-player-shell">
          {!video.fallback && !embedFailed && !isNativeCapacitor ? (
            <iframe
              src={buildVideoEmbedUrl(video.youtubeId, true, {
                mute: false,
                controls: true,
                loop: false,
              })}
              title={video.title}
              className="video-player-frame"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setEmbedLoaded(true)}
              onError={() => setEmbedFailed(true)}
            />
          ) : (
            <div className="video-detail-placeholder">
              {video.thumbnailUrl ? (
                <Image
                  src={video.thumbnailUrl}
                  alt={video.title}
                  fill
                  sizes="100vw"
                  className="video-thumbnail"
                  unoptimized
                />
              ) : null}
              <div
                className="stack"
                style={{
                  position: "absolute",
                  inset: "auto 16px 16px 16px",
                  gap: "10px",
                  zIndex: 2,
                }}
              >
                <button
                  type="button"
                  className="button"
                  onClick={() => void openOriginalArticleUrl(video.watchUrl)}
                >
                  Watch Video
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="engagement-row article-detail-actions trending-stats-row article-detail-stats-row">
          <button
            className={`icon-action-pill ${liked ? "icon-action-pill-active" : ""}`}
            onClick={() => {
              setLiked((current) => !current);
              setLikesCount((current) => (liked ? Math.max(0, current - 1) : current + 1));
            }}
            aria-label={liked ? "Unlike video" : "Like video"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <HeartIcon filled={liked} size={20} strokeWidth={1.9} />
            </span>
            <span>{likesCount}</span>
          </button>
          <button className="icon-action-pill" aria-label="Comments" onClick={scrollToComments}>
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
              </svg>
            </span>
            <span>{comments.length}</span>
          </button>
          <ShareButton path={`/video/${video.id}`} title={video.title} url={video.watchUrl} iconOnly />
          <button
            className={`bookmark-button ${saved ? "bookmark-button-active" : ""}`}
            onClick={() => setSaved((current) => !current)}
            aria-label={saved ? "Remove bookmark" : "Save video"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                  fill={saved ? "currentColor" : "none"}
                />
              </svg>
            </span>
          </button>
        </div>
      </section>

      <section
        ref={commentsSectionRef}
        id="comments"
        className="section-card article-comments-inline"
        aria-label="Comments"
      >
        <div className="article-comments-inline-header">
          <h3 className="article-comments-inline-title">Comments</h3>
        </div>

        <div className="article-comments-thread article-comments-inline-thread">
          {displayedComments.length === 0 ? (
            <div className="empty-state">
              <strong>No comments yet</strong>
              <span>Start the conversation on this video.</span>
            </div>
          ) : (
            <div className="comment-list article-comment-list">
              {displayedComments.map((comment) => (
                <div
                  key={comment.id}
                  id={`comment-${comment.id}`}
                  className="comment-thread-row"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setCommentActionTarget(comment);
                  }}
                  onMouseDown={() => startCommentLongPress(comment)}
                  onMouseUp={clearCommentLongPress}
                  onMouseLeave={clearCommentLongPress}
                  onTouchStart={() => startCommentLongPress(comment)}
                  onTouchEnd={clearCommentLongPress}
                >
                  <div className="comment-thread-main">
                    <div className="comment-thread-copy">
                      <div className="comment-header">
                        <div className="comment-user-heading">
                          {comment.user_id ? (
                            <Link href={`/user/${comment.user_id}`} className="comment-user-link">
                              <span className="comment-user-avatar">
                                {comment.avatar_url ? (
                                  <Image
                                    src={comment.avatar_url}
                                    alt={comment.username ?? "User avatar"}
                                    width={34}
                                    height={34}
                                    unoptimized
                                  />
                                ) : (
                                  (comment.username ?? "U").charAt(0).toUpperCase()
                                )}
                              </span>
                              <span className="comment-username">
                                {comment.username ?? "Unknown"}
                              </span>
                            </Link>
                          ) : (
                            <strong className="comment-username">
                              {comment.username ?? "Unknown"}
                            </strong>
                          )}
                          <span className="comment-header-time">
                            · {formatRelativeTime(comment.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="comment-body">{comment.text}</div>
                      <button
                        className="comment-action article-comment-reply-action"
                        type="button"
                        onClick={() =>
                          setReplyTarget({
                            commentId: comment.id,
                            username: comment.username,
                          })
                        }
                      >
                        Reply
                      </button>
                      {comment.replies.length > 0 ? (
                        <div className="comment-replies">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="comment-reply-card">
                              <div className="comment-header">
                                <div className="comment-user-heading">
                                  {reply.user_id ? (
                                    <Link
                                      href={`/user/${reply.user_id}`}
                                      className="comment-user-link"
                                    >
                                      <span className="comment-user-avatar">
                                        {reply.avatar_url ? (
                                          <Image
                                            src={reply.avatar_url}
                                            alt={reply.username ?? "User avatar"}
                                            width={34}
                                            height={34}
                                            unoptimized
                                          />
                                        ) : (
                                          (reply.username ?? "U").charAt(0).toUpperCase()
                                        )}
                                      </span>
                                      <span className="comment-username">
                                        {reply.username ?? "Unknown"}
                                      </span>
                                    </Link>
                                  ) : (
                                    <strong className="comment-username">
                                      {reply.username ?? "Unknown"}
                                    </strong>
                                  )}
                                  <span className="comment-header-time">
                                    · {formatRelativeTime(reply.created_at)}
                                  </span>
                                </div>
                              </div>
                              <div className="comment-body">{reply.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="comment-thread-reactions">
                      <button
                        className={`comment-reaction-pill ${
                          comment.currentUserReaction === "like"
                            ? "comment-reaction-pill-active"
                            : ""
                        }`}
                        onClick={() => handleToggleCommentReaction(comment.id)}
                        disabled={activeCommentAction === `reaction-${comment.id}`}
                        aria-label={
                          comment.currentUserReaction === "like"
                            ? "Remove heart"
                            : "Heart comment"
                        }
                      >
                        <span className="comment-reaction-glyph" aria-hidden="true">
                          <HeartIcon
                            filled={comment.currentUserReaction === "like"}
                            size={20}
                            strokeWidth={1.9}
                          />
                        </span>
                        <span>{comment.likes}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="comment-sheet-composer article-comments-inline-composer">
          {replyTarget ? (
            <div className="comment-reply-banner">
              <span>
                Replying to <strong>{replyTarget.username ?? "this comment"}</strong>
              </span>
              <button className="comment-action" onClick={() => setReplyTarget(null)} type="button">
                Cancel
              </button>
            </div>
          ) : null}

          <div className="input-row bottom-sheet-input-row">
            <input
              ref={commentInputRef}
              className="input"
              type="text"
              placeholder={replyTarget ? "Write a reply..." : "Write a comment..."}
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
            />
            <button
              className="button button-secondary article-comment-send-button"
              onClick={handleAddComment}
              aria-label={replyTarget ? "Send reply" : "Send comment"}
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg {...actionIconProps}>
                  <path d="M22 2 11 13" />
                  <path d="m22 2-7 20-4-9-9-4Z" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>

      {commentActionTarget ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comment actions"
          onClick={() => setCommentActionTarget(null)}
        >
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="source-sheet-actions">
              <button
                className="button source-sheet-button button-secondary"
                onClick={() => {
                  setCommentActionTarget(null);
                  setReportingCommentId(commentActionTarget.id);
                  setReportReason("");
                  setReportStatus(null);
                }}
              >
                Report
              </button>
              {commentActionTarget.user_id === userId ? (
                <button
                  className="button source-sheet-button button-secondary"
                  onClick={() => {
                    setCommentActionTarget(null);
                    setDeleteCommentId(commentActionTarget.id);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button
                className="button source-sheet-button button-secondary"
                onClick={() => setCommentActionTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="stack" style={{ gap: "8px" }}>
              <h3 className="modal-title">Report comment</h3>
              <p className="muted">Tell us why this comment should be reviewed.</p>
            </div>
            <textarea
              className="input"
              rows={4}
              placeholder="Reason for report"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
            />
            {reportStatus ? (
              <div
                className={`status-message ${
                  reportStatus.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {reportStatus.text}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setReportingCommentId(null);
                  setReportReason("");
                  setReportStatus(null);
                }}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={handleReportComment}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="stack" style={{ gap: "8px" }}>
              <h3 className="modal-title">Delete comment?</h3>
              <p className="muted">This will remove your comment from the video discussion.</p>
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setDeleteCommentId(null)}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={handleDeleteComment}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
