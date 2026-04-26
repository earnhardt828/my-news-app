"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ShareButton from "../../components/share-button";
import SourceBadge from "../../components/source-badge";
import { supabase } from "../../../lib/supabase";

type ArticleRecord = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  image?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
};

type ArticleComment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

type DbComment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbLike = {
  id: number;
  article_id: number;
  user_id: string | null;
};

type DbProfile = {
  id: string;
  avatar_url: string | null;
};

type DbBlockedUser = {
  blocked_user_id: string;
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

  if (diffMinutes === 1) {
    return "1 minute ago";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours === 1) {
    return "1 hour ago";
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "1 day ago";
  }

  return `${diffDays} days ago`;
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const articleId = Number(params.id);
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [likedByCurrentUser, setLikedByCurrentUser] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    async function loadArticle() {
      if (!articleId || Number.isNaN(articleId)) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id ?? null;
      setUserId(currentUserId);

      const [newsRes, likesRes, commentsRes, profilesRes] = await Promise.all([
        fetch("/api/news"),
        supabase
          .from("likes")
          .select("id, article_id, user_id")
          .eq("article_id", articleId),
        supabase
          .from("comments")
          .select("id, text, username, user_id, created_at")
          .eq("article_id", articleId),
        supabase.from("profiles").select("id, avatar_url"),
      ]);

      const { data: savedArticlesData } = currentUserId
        ? await supabase
            .from("saved_articles")
            .select("article_id")
            .eq("user_id", currentUserId)
            .eq("article_id", articleId)
            .maybeSingle()
        : { data: null as { article_id: number } | null };

      const { data: blockedUsersData } = currentUserId
        ? await supabase
            .from("blocked_users")
            .select("blocked_user_id")
            .eq("blocker_id", currentUserId)
        : { data: [] as DbBlockedUser[] };

      const newsData = (await newsRes.json()) as ArticleRecord[];
      const targetArticle =
        newsData.find((item) => item.id === articleId) ?? null;

      const likes = (likesRes.data ?? []) as DbLike[];
      const rawComments = (commentsRes.data ?? []) as DbComment[];
      const profiles = (profilesRes.data ?? []) as DbProfile[];
      const blockedIds = new Set(
        ((blockedUsersData ?? []) as DbBlockedUser[]).map(
          (blockedUser) => blockedUser.blocked_user_id
        )
      );
      const avatarLookup = new Map(
        profiles.map((profile) => [profile.id, profile.avatar_url])
      );

      setArticle(targetArticle);
      setLikesCount(likes.length);
      setLikedByCurrentUser(
        likes.some((like) => like.user_id && like.user_id === currentUserId)
      );
      setIsSaved(Boolean(savedArticlesData));
      setBlockedUserIds([...blockedIds]);
      setComments(
        rawComments
          .filter(
            (comment) => !comment.user_id || !blockedIds.has(comment.user_id)
          )
          .map((comment) => ({
            id: comment.id,
            text: comment.text,
            username: comment.username,
            user_id: comment.user_id,
            created_at: comment.created_at,
            avatar_url: comment.user_id
              ? avatarLookup.get(comment.user_id) ?? null
              : null,
          }))
      );
      setIsLoading(false);
    }

    loadArticle();
  }, [articleId]);

  const handleToggleLike = async () => {
    if (!userId) {
      alert("Log in to like posts");
      return;
    }

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error removing like:", error);
        return;
      }

      setLikedByCurrentUser(false);
      setLikesCount((prev) => Math.max(0, prev - 1));
      return;
    }

    const { error } = await supabase.from("likes").insert({
      article_id: articleId,
      user_id: userId,
    });

    if (error) {
      console.error("Error saving like:", error);
      return;
    }

    setLikedByCurrentUser(true);
    setLikesCount((prev) => prev + 1);
  };

  const handleToggleSave = async () => {
    if (!userId || !article) {
      alert("Log in to save articles");
      return;
    }

    if (isSaved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", article.id);

      if (error) {
        console.error("Error removing saved article:", error);
        return;
      }

      setIsSaved(false);
      return;
    }

    const { error } = await supabase.from("saved_articles").insert({
      user_id: userId,
      article_id: article.id,
      title: article.title,
      source: article.source,
      category: article.category,
      time: article.time,
    });

    if (error) {
      console.error("Error saving article:", error);
      return;
    }

    setIsSaved(true);
  };

  const formatPublishedTimestamp = (publishedAt?: string | null, fallback?: string) => {
    const date = publishedAt ? new Date(publishedAt) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return fallback ?? "Unknown";
    }

    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  const handleBlockUser = async (blockedUserId: string, blockedUsername?: string | null) => {
    if (!userId) {
      alert("Log in to block users");
      return;
    }

    if (blockedUserId === userId) {
      alert("You cannot block your own account");
      return;
    }

    if (blockedUserIds.includes(blockedUserId)) {
      alert("That user is already blocked");
      return;
    }

    setActiveCommentAction(`block-${blockedUserId}`);

    const { error } = await supabase.from("blocked_users").insert({
      blocker_id: userId,
      blocked_user_id: blockedUserId,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error blocking user:", error);
      alert("Could not block that user");
      return;
    }

    setBlockedUserIds((prev) => [...prev, blockedUserId]);
    setComments((prev) =>
      prev.filter((comment) => comment.user_id !== blockedUserId)
    );
    alert(`Blocked ${blockedUsername ?? "this user"}. Their comments are now hidden.`);
  };

  if (isLoading) {
    return (
      <section className="page-shell">
        <div className="loading-state">
          <strong>Loading article</strong>
          <span>Fetching story details, likes, and comments.</span>
        </div>
      </section>
    );
  }

  if (!article) {
    return (
      <section className="page-shell">
        <div className="empty-state">
          <strong>Article not found</strong>
          <span>This story is unavailable or could not be loaded.</span>
        </div>
      </section>
    );
  }

  const rawContent = article.content?.trim() ?? "";
  const rawDescription = article.description?.trim() ?? "";
  const hadContentTruncationMarker = /\[\+\d+\s+chars\]\s*$/i.test(rawContent);
  const cleanedContent = rawContent
    .replace(/\s*\[\+\d+\s+chars\]\s*$/i, "")
    .trim();
  const contentEndsWithEllipsis = /(\.\.\.|…)\s*$/.test(cleanedContent);
  const hasReliableFullLocalContent =
    Boolean(cleanedContent) &&
    !hadContentTruncationMarker &&
    !contentEndsWithEllipsis;
  const localFullStory = hasReliableFullLocalContent
    ? cleanedContent
    : rawDescription || cleanedContent || "No additional content available.";
  const previewText =
    hasReliableFullLocalContent && localFullStory.length > 320
      ? localFullStory.slice(0, 320).trimEnd()
      : localFullStory;
  const remainingStory = hasReliableFullLocalContent
    ? localFullStory.slice(previewText.length).trimStart()
    : "";
  const hasAdditionalLocalContent = remainingStory.length > 0;

  const handleClose = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <section className="page-shell">
      <div className="article-close-bar">
        <button className="article-close-button" onClick={handleClose} aria-label="Close article">
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <section className="section-card article-detail-hero">
        <div className="stack" style={{ gap: "10px" }}>
          <div className="article-detail-kicker-row">
            <span className="article-detail-source-wrap">
              <SourceBadge sourceName={article.source} />
              <span className="article-detail-source">{article.source}</span>
            </span>
            <span className="chip chip-accent">{article.category}</span>
          </div>
          <h2 className="article-detail-title">{article.title}</h2>
          <p className="article-detail-byline">
            Published: {formatPublishedTimestamp(article.publishedAt, article.time)}
          </p>
        </div>

        {article.image ? (
          <img
            src={article.image}
            alt={article.title}
            className="article-image article-image-lg"
          />
        ) : null}

        <div className="engagement-row article-detail-actions trending-stats-row article-detail-stats-row">
          <button
            className={`icon-action-pill ${likedByCurrentUser ? "icon-action-pill-active" : ""}`}
            onClick={handleToggleLike}
            aria-label={likedByCurrentUser ? "Unlike article" : "Like article"}
          >
            <span aria-hidden="true">{likedByCurrentUser ? "♥" : "♡"}</span>
            <span>{likesCount}</span>
          </button>
          <button className="icon-action-pill icon-action-pill-static" aria-label="Comments">
            <span aria-hidden="true">💬</span>
            <span>{comments.length}</span>
          </button>
          <ShareButton
            path={`/article/${article.id}`}
            title={article.title}
            url={article.url}
            iconOnly
          />
          <button
            className={`bookmark-button ${isSaved ? "bookmark-button-active" : ""}`}
            onClick={handleToggleSave}
            aria-label={isSaved ? "Remove bookmark" : "Save article"}
          >
            {isSaved ? "🔖" : "📑"}
          </button>
        </div>

        <div className="article-detail-body">
          <div className="article-detail-section">
            <p className="article-detail-label">Full story</p>
            <div className="article-detail-copy">
              {previewText}
              {isExpanded && hasAdditionalLocalContent ? (
                <span className="article-detail-copy-continued"> {remainingStory}</span>
              ) : null}
              {!isExpanded && hasAdditionalLocalContent ? (
                <>
                  ...{" "}
                  <button
                    className="article-more-button"
                    onClick={() => setIsExpanded(true)}
                  >
                    More
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {article.url ? (
        <div className="article-story-links">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="button button-secondary article-original-button"
          >
            Original article
          </a>
        </div>
      ) : null}

      <section className="section-card stack">
        {comments.length === 0 ? (
          <div className="empty-state">
            <strong>No comments yet</strong>
            <span>Comments for this article will appear here.</span>
          </div>
        ) : (
          <div className="comment-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-card">
                <div className="comment-header">
                  {comment.user_id ? (
                    <Link
                      href={`/user/${comment.user_id}`}
                      className="comment-user-link"
                    >
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
                    <strong>{comment.username ?? "Unknown"}</strong>
                  )}
                </div>
                <div className="comment-body">{comment.text}</div>
                <div className="comment-meta">
                  {formatRelativeTime(comment.created_at)}
                </div>
                {comment.user_id && comment.user_id !== userId ? (
                  <div className="comment-actions">
                    <button
                      className="comment-action"
                      onClick={() => handleBlockUser(comment.user_id!, comment.username)}
                      disabled={activeCommentAction === `block-${comment.user_id}`}
                    >
                      {activeCommentAction === `block-${comment.user_id}`
                        ? "Blocking..."
                        : "Block"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
