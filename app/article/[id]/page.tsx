"use client";

import Image from "next/image";
import ArticleReaderButton from "../../components/article-reader-button";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ShareButton from "../../components/share-button";
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
  const articleId = Number(params.id);
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);

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
        supabase.from("likes").select("id, article_id").eq("article_id", articleId),
        supabase
          .from("comments")
          .select("id, text, username, user_id, created_at")
          .eq("article_id", articleId),
        supabase.from("profiles").select("id, avatar_url"),
      ]);

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

  return (
    <section className="page-shell">
      <section className="section-card article-detail-hero">
        <div className="stack" style={{ gap: "10px" }}>
          <p className="page-eyebrow">Article</p>
          <div className="article-detail-kicker-row">
            <span className="chip chip-accent">{article.category}</span>
            <span className="article-detail-source">{article.source}</span>
          </div>
          <h2 className="article-detail-title">{article.title}</h2>
          <p className="article-detail-byline">
            Published {article.publishedAt ?? article.time} by {article.source}
          </p>
          {article.description ? (
            <p className="article-detail-lede">{article.description}</p>
          ) : null}
        </div>

        {article.image ? (
          <img
            src={article.image}
            alt={article.title}
            className="article-image article-image-lg"
          />
        ) : null}

        <div className="engagement-row article-detail-actions">
          <span className="stat-pill">❤️ {likesCount} likes</span>
          <span className="stat-pill">💬 {comments.length} comments</span>
          <ArticleReaderButton title={article.title} url={article.url} />
          <ShareButton
            path={`/article/${article.id}`}
            title={article.title}
            url={article.url}
          />
        </div>

        <div className="article-detail-body">
          <div className="article-detail-section">
            <p className="article-detail-label">Full story</p>
            <div className="article-detail-copy">
              {article.content ??
                article.description ??
                "No additional content available."}
            </div>
          </div>
        </div>

        <Link href="/" className="button button-secondary">
          Back to Trending
        </Link>
      </section>

      <section className="section-card stack">
        <div>
          <p className="page-eyebrow article-comments-eyebrow">
            Comments
          </p>
          <h3 className="article-comments-title">
            Reader discussion
          </h3>
          <p className="article-comments-subtitle">
            Reactions from the Mirur community on this story.
          </p>
        </div>

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
