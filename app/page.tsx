"use client";

import AdSlot from "./components/ad-slot";
import VideoFeedCard from "./components/video-feed-card";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ShareButton from "./components/share-button";
import { supabase } from "../lib/supabase";
import {
  buildVideoEmbedUrl,
  initialVideos,
  normalizeVideoFeedItems,
  type VideoApiItem,
  type VideoItem,
} from "../lib/video-feed";

type Comment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  likes: number;
  dislikes: number;
  currentUserReaction: "like" | "dislike" | null;
};

type Article = {
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
  likes: number;
  likeUsers: LikeUser[];
  likedByCurrentUser: boolean;
  comments: Comment[];
  saved: boolean;
};

type LikeUser = {
  user_id: string | null;
  username: string | null;
};

type DbComment = {
  id: number;
  article_id: number;
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
  username: string | null;
};

type DbSavedArticle = {
  article_id: number;
};

type DbBlockedUser = {
  blocked_user_id: string;
};

type DbCommentReaction = {
  id: number;
  comment_id: number;
  user_id: string;
  reaction_type: "like" | "dislike";
};

const categoryLabels: Record<string, string> = {
  Business: "Business 💼",
  Tech: "Tech 💻",
  Sports: "Sports 🏈",
  Politics: "Politics 🏛️",
  Health: "Health 🏥",
  Science: "Science 🔬",
  Entertainment: "Entertainment 🎬",
  World: "World 🌍",
};

function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

function formatPublishedDate(publishedAt?: string | null, fallback?: string) {
  if (!publishedAt) {
    return fallback ? `Published ${fallback}` : "Published recently";
  }

  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    return fallback ? `Published ${fallback}` : "Published recently";
  }

  return `Published ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

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

function FeedSkeleton() {
  return (
    <div className="stack">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="skeleton-card">
          <div className="skeleton-meta-row">
            <div className="skeleton-line skeleton-chip" />
            <div className="skeleton-line skeleton-body-sm" />
            <div className="skeleton-line skeleton-body-sm" />
          </div>

          <div className="stack" style={{ gap: "8px" }}>
            <div className="skeleton-line skeleton-title-lg skeleton-body-lg" />
            <div className="skeleton-line skeleton-title skeleton-body-md" />
          </div>

          <div className="skeleton-action-row">
            <div className="skeleton-line skeleton-button" />
            <div className="skeleton-line skeleton-button" />
            <div className="skeleton-line skeleton-stat" />
            <div className="skeleton-line skeleton-stat" />
          </div>

          <div className="skeleton-comment-list">
            {Array.from({ length: 2 }).map((__, commentIndex) => (
              <div key={commentIndex} className="skeleton-comment-card">
                <div className="skeleton-comment-row">
                  <div className="skeleton-circle" />
                  <div className="skeleton-line skeleton-body-sm" />
                </div>
                <div className="skeleton-line skeleton-body-lg" />
                <div className="skeleton-line skeleton-body-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<"trending" | "my-feed" | "latest">(
    "trending"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    articleId: number;
    commentId: number;
  } | null>(null);
  const [activeSaveArticleId, setActiveSaveArticleId] = useState<number | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [activeCommentsArticleId, setActiveCommentsArticleId] = useState<number | null>(
    null
  );
  const [commentSortMode, setCommentSortMode] = useState<
    "top" | "controversial" | "newest"
  >("top");
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );

  useEffect(() => {
    async function fetchNewsAndEngagement() {
      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);

      if (userData.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, categories")
          .eq("id", userData.user.id)
          .maybeSingle();

        setUsername(profile?.username ?? null);
        setCategories(profile?.categories ?? []);
      } else {
        setUsername(null);
        setCategories([]);
      }

      const newsRes = await fetch("/api/news");
      const newsData = (await newsRes.json()) as Omit<
        Article,
        "likes" | "likeUsers" | "likedByCurrentUser" | "comments" | "saved"
      >[];

      const { data: likesData } = await supabase
        .from("likes")
        .select("id, article_id, user_id");

      const { data: commentsData } = await supabase
        .from("comments")
        .select("id, article_id, text, username, user_id, created_at");

      const { data: commentReactionsData } = await supabase
        .from("comment_reactions")
        .select("id, comment_id, user_id, reaction_type");

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, avatar_url, username");

      const { data: savedArticlesData } = userData.user?.id
        ? await supabase
            .from("saved_articles")
            .select("article_id")
            .eq("user_id", userData.user.id)
        : { data: [] as DbSavedArticle[] };

      const { data: blockedUsersData } = userData.user?.id
        ? await supabase
            .from("blocked_users")
            .select("blocked_user_id")
            .eq("blocker_id", userData.user.id)
        : { data: [] as DbBlockedUser[] };

      const likes = (likesData ?? []) as DbLike[];
      const comments = (commentsData ?? []) as DbComment[];
      const commentReactions = (commentReactionsData ?? []) as DbCommentReaction[];
      const profiles = (profilesData ?? []) as DbProfile[];
      const blockedIds = new Set(
        ((blockedUsersData ?? []) as DbBlockedUser[]).map(
          (blockedUser) => blockedUser.blocked_user_id
        )
      );
      const savedArticleIds = new Set(
        ((savedArticlesData ?? []) as DbSavedArticle[]).map(
          (savedArticle) => savedArticle.article_id
        )
      );
      const avatarLookup = new Map(
        profiles.map((profile) => [profile.id, profile.avatar_url])
      );

      const mergedArticles: Article[] = newsData.map((item) => {
        const articleLikes = likes.filter((like) => like.article_id === item.id).length;
        const articleLikeUsers = likes
          .filter((like) => like.article_id === item.id)
          .map((like) => ({
            user_id: like.user_id,
            username: like.user_id
              ? profiles.find((profile) => profile.id === like.user_id)?.username ?? null
              : null,
          }));
        const articleComments = comments
          .filter(
            (comment) =>
              comment.article_id === item.id &&
              (!comment.user_id || !blockedIds.has(comment.user_id))
          )
          .map((comment) => {
            const reactions = commentReactions.filter(
              (reaction) => reaction.comment_id === comment.id
            );

            return {
              id: comment.id,
              text: comment.text,
              username: comment.username,
              user_id: comment.user_id,
              avatar_url: comment.user_id
                ? avatarLookup.get(comment.user_id) ?? null
                : null,
              created_at: comment.created_at,
              likes: reactions.filter((reaction) => reaction.reaction_type === "like")
                .length,
              dislikes: reactions.filter(
                (reaction) => reaction.reaction_type === "dislike"
              ).length,
              currentUserReaction:
                reactions.find((reaction) => reaction.user_id === userData.user?.id)
                  ?.reaction_type ?? null,
            };
          });

        return {
          ...item,
          likes: articleLikes,
          likeUsers: articleLikeUsers,
          likedByCurrentUser: articleLikeUsers.some(
            (likeUser) => likeUser.user_id === userData.user?.id
          ),
          comments: articleComments,
          saved: savedArticleIds.has(item.id),
        };
      });

      setBlockedUserIds([...blockedIds]);
      setArticles(mergedArticles);
      setIsLoading(false);
    }

    fetchNewsAndEngagement();
  }, []);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const response = await fetch("/api/videos");
        const data = (await response.json()) as {
          videos?: VideoApiItem[];
        };

        setVideos(normalizeVideoFeedItems(data.videos));
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos(initialVideos);
      }
    }

    fetchVideos();
  }, []);

  const handleLike = async (articleId: number) => {
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

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                likes: Math.max(0, article.likes - 1),
                likeUsers: article.likeUsers.filter(
                  (likeUser) => likeUser.user_id !== userId
                ),
                likedByCurrentUser: false,
              }
            : article
        )
      );
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

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              likes: article.likes + 1,
              likeUsers: [
                ...article.likeUsers,
                {
                  user_id: userId,
                  username,
                },
              ],
              likedByCurrentUser: true,
            }
          : article
      )
    );
  };

  const handleToggleSaveArticle = async (article: Article) => {
    if (!userId) {
      alert("Log in to save articles");
      return;
    }

    setActiveSaveArticleId(article.id);

    if (article.saved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", article.id);

      setActiveSaveArticleId(null);

      if (error) {
        console.error("Error removing saved article:", error);
        alert("Could not remove saved article");
        return;
      }

      setArticles((prev) =>
        prev.map((currentArticle) =>
          currentArticle.id === article.id
            ? { ...currentArticle, saved: false }
            : currentArticle
        )
      );

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

    setActiveSaveArticleId(null);

    if (error) {
      console.error("Error saving article:", error);
      alert("Could not save article");
      return;
    }

    setArticles((prev) =>
      prev.map((currentArticle) =>
        currentArticle.id === article.id
          ? { ...currentArticle, saved: true }
          : currentArticle
      )
    );
  };

  const handleCommentInputChange = (articleId: number, value: string) => {
    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: value,
    }));
  };

  const handleAddComment = async (articleId: number) => {
    const text = commentInputs[articleId]?.trim();

    if (!text) return;

    if (!userId) {
      alert("Log in to comment");
      return;
    }

    if (!username) {
      alert("Set a username on your Profile page first");
      return;
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        article_id: articleId,
        text,
        user_id: userId,
        username,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving comment:", error);
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: [
                ...article.comments,
                {
                  id: data.id,
                  text: data.text,
                  username: data.username,
                  user_id: data.user_id,
                  avatar_url: null,
                  created_at: data.created_at,
                  likes: 0,
                  dislikes: 0,
                  currentUserReaction: null,
                },
              ],
            }
          : article
      )
    );

    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: "",
    }));
  };

  const handleDeleteComment = async (articleId: number, commentId: number) => {
    if (!userId) {
      alert("Log in to manage comments");
      return;
    }

    const targetComment = articles
      .find((article) => article.id === articleId)
      ?.comments.find((comment) => comment.id === commentId);

    if (!targetComment || targetComment.user_id !== userId) {
      alert("You can only delete your own comments");
      return;
    }

    setActiveCommentAction(`delete-${commentId}`);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId);

    setActiveCommentAction(null);

    if (error) {
      console.error("Error deleting comment:", error);
      alert("Could not delete comment");
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: article.comments.filter((comment) => comment.id !== commentId),
            }
          : article
      )
    );
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
    setArticles((prev) =>
      prev.map((article) => ({
        ...article,
        comments: article.comments.filter((comment) => comment.user_id !== blockedUserId),
      }))
    );
    alert(`Blocked ${blockedUsername ?? "this user"}. Their comments are now hidden.`);
  };

  const handleCommentReaction = async (
    articleId: number,
    commentId: number,
    reactionType: "like" | "dislike"
  ) => {
    if (!userId) {
      alert("Log in to react to comments");
      return;
    }

    const targetComment = articles
      .find((article) => article.id === articleId)
      ?.comments.find((comment) => comment.id === commentId);

    if (!targetComment) {
      return;
    }

    setActiveCommentAction(`reaction-${commentId}`);

    const { data: existingReaction } = await supabase
      .from("comment_reactions")
      .select("id, reaction_type")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingReaction?.reaction_type === reactionType) {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error removing comment reaction:", error);
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
                  comment.id === commentId
                    ? {
                        ...comment,
                        likes:
                          reactionType === "like"
                            ? Math.max(0, comment.likes - 1)
                            : comment.likes,
                        dislikes:
                          reactionType === "dislike"
                            ? Math.max(0, comment.dislikes - 1)
                            : comment.dislikes,
                        currentUserReaction: null,
                      }
                    : comment
                ),
              }
            : article
        )
      );
      return;
    }

    if (existingReaction) {
      const { error } = await supabase
        .from("comment_reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error updating comment reaction:", error);
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
                  comment.id === commentId
                    ? {
                        ...comment,
                        likes:
                          reactionType === "like"
                            ? comment.likes + 1
                            : Math.max(0, comment.likes - 1),
                        dislikes:
                          reactionType === "dislike"
                            ? comment.dislikes + 1
                            : Math.max(0, comment.dislikes - 1),
                        currentUserReaction: reactionType,
                      }
                    : comment
                ),
              }
            : article
        )
      );
      return;
    }

    const { error } = await supabase.from("comment_reactions").insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: reactionType,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error creating comment reaction:", error);
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: article.comments.map((comment) =>
                comment.id === commentId
                  ? {
                      ...comment,
                      likes: reactionType === "like" ? comment.likes + 1 : comment.likes,
                      dislikes:
                        reactionType === "dislike"
                          ? comment.dislikes + 1
                          : comment.dislikes,
                      currentUserReaction: reactionType,
                    }
                  : comment
              ),
            }
          : article
      )
    );
  };

  const openDeleteModal = (articleId: number, commentId: number) => {
    setDeleteTarget({ articleId, commentId });
  };

  const closeDeleteModal = () => {
    if (deleteTarget && activeCommentAction === `delete-${deleteTarget.commentId}`) {
      return;
    }

    setDeleteTarget(null);
  };

  const confirmDeleteComment = async () => {
    if (!deleteTarget) {
      return;
    }

    await handleDeleteComment(deleteTarget.articleId, deleteTarget.commentId);
    setDeleteTarget(null);
  };

  const openReportModal = (commentId: number) => {
    if (!userId) {
      alert("Log in to report comments");
      return;
    }

    setReportingCommentId(commentId);
    setReportReason("");
    setReportStatus(null);
  };

  const closeReportModal = () => {
    if (activeCommentAction?.startsWith("report-")) {
      return;
    }

    setReportingCommentId(null);
    setReportReason("");
    setReportStatus(null);
  };

  const handleSubmitReport = async () => {
    if (!userId || reportingCommentId === null) {
      alert("Log in to report comments");
      return;
    }

    const trimmedReason = reportReason.trim();

    if (!trimmedReason) {
      setReportStatus({
        type: "error",
        text: "Please enter a reason before submitting your report.",
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
      console.error("Error reporting comment:", error);
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
    }, 1200);
  };

  const displayedArticles = useMemo(() => {
    const copied = [...articles];

    if (sortMode === "my-feed") {
      const filtered =
        categories.length > 0
          ? copied.filter((article) => categories.includes(article.category))
          : copied;

      return filtered.sort((a, b) => {
        const scoreA = a.likes + a.comments.length;
        const scoreB = b.likes + b.comments.length;
        return scoreB - scoreA;
      });
    }

    if (sortMode === "latest") {
      return copied.sort((a, b) => {
        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

        if (timeA === timeB) {
          return b.id - a.id;
        }

        return timeB - timeA;
      });
    }

    return copied.sort((a, b) => {
      const scoreA = a.likes + a.comments.length;
      const scoreB = b.likes + b.comments.length;
      return scoreB - scoreA;
    });
  }, [articles, categories, sortMode]);

  const activeCommentsArticle =
    activeCommentsArticleId === null
      ? null
      : articles.find((article) => article.id === activeCommentsArticleId) ?? null;

  const displayedBottomSheetComments = useMemo(() => {
    if (!activeCommentsArticle) {
      return [];
    }

    const copied = [...activeCommentsArticle.comments];

    if (commentSortMode === "newest") {
      return copied.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (commentSortMode === "controversial") {
      return copied.sort((a, b) => {
        if (b.dislikes === a.dislikes) {
          return b.likes - a.likes;
        }

        return b.dislikes - a.dislikes;
      });
    }

    return copied.sort((a, b) => {
      const scoreA = a.likes - a.dislikes;
      const scoreB = b.likes - b.dislikes;

      if (scoreB === scoreA) {
        return b.likes - a.likes;
      }

      return scoreB - scoreA;
    });
  }, [activeCommentsArticle, commentSortMode]);

  const activeVideo =
    activeVideoId === null ? null : videos.find((video) => video.id === activeVideoId) ?? null;

  const activeCommentsVideo =
    activeCommentsVideoId === null
      ? null
      : videos.find((video) => video.id === activeCommentsVideoId) ?? null;

  const handleToggleVideoLike = (videoId: string) => {
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId
          ? {
              ...video,
              liked: !video.liked,
              likes: video.liked ? Math.max(0, video.likes - 1) : video.likes + 1,
            }
          : video
      )
    );
  };

  const handleToggleVideoSave = (videoId: string) => {
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      )
    );
  };

  return (
    <section className="page-shell">
      <div className="page-hero">
        <div className="page-title-row">
          <div className="toolbar">
            <button
              className={`toolbar-pill ${
                sortMode === "trending" ? "toolbar-pill-active" : ""
              }`}
              onClick={() => setSortMode("trending")}
            >
              Trending
            </button>
            <button
              className={`toolbar-pill ${
                sortMode === "my-feed" ? "toolbar-pill-active" : ""
              }`}
              onClick={() => setSortMode("my-feed")}
            >
              My Feed
            </button>
            <button
              className={`toolbar-pill ${
                sortMode === "latest" ? "toolbar-pill-active" : ""
              }`}
              onClick={() => setSortMode("latest")}
            >
              Latest
            </button>
          </div>
        </div>
      </div>

      {sortMode === "my-feed" ? (
        <div className="section-card stack">
          <strong>Following</strong>
          {categories.length === 0 ? (
            <div className="empty-state">
              <strong>No categories selected</strong>
              <span>Go to Profile and pick categories to personalize this feed.</span>
            </div>
          ) : (
            <div className="category-grid">
              {categories.map((category) => (
                <span key={category} className="chip chip-accent">
                  {getCategoryLabel(category)}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {isLoading ? (
        <FeedSkeleton />
      ) : sortMode === "my-feed" && categories.length === 0 ? (
        <div className="empty-state">
          <strong>No categories selected</strong>
          <span>Choose categories in Profile to build your personalized feed.</span>
        </div>
      ) : displayedArticles.length === 0 ? (
        <div className="empty-state">
          <strong>{sortMode === "my-feed" ? "No articles found" : "No stories yet"}</strong>
          <span>
            {sortMode === "my-feed"
              ? "Try adding more categories or check back when new stories land."
              : "When your API returns articles, they’ll show up here."}
          </span>
        </div>
      ) : (
        <div className="stack">
          {displayedArticles.map((article, index) => (
            <div key={article.id} className="stack">
              <article className="news-card">
                <Link href={`/article/${article.id}`} className="article-link">
                  <div className="trending-title-row">
                    <h3 className="trending-article-title">{article.title}</h3>
                    {index < 3 ? (
                      <span className="chip trending-rank-badge">Top {index + 1}</span>
                    ) : null}
                  </div>

                  {article.image ? (
                    <img
                      src={article.image}
                      alt={article.title}
                      className="article-image"
                    />
                  ) : null}

                  <div className="news-card-header">
                    <div className="trending-source-row">
                      <div className="trending-source-brand">
                        <span className="source-avatar" aria-hidden="true">
                          {article.source.charAt(0).toUpperCase()}
                        </span>
                        <span className="trending-source-name">{article.source}</span>
                      </div>
                      <span className="chip chip-accent">
                        {getCategoryLabel(article.category)}
                      </span>
                    </div>
                    <span className="trending-published-date">
                      {formatPublishedDate(article.publishedAt, article.time)}
                    </span>
                  </div>
                </Link>

                <div className="engagement-row trending-stats-row">
                  <button
                    className={`icon-action-pill ${
                      article.likedByCurrentUser ? "icon-action-pill-active" : ""
                    }`}
                    onClick={() => handleLike(article.id)}
                    aria-label={article.likedByCurrentUser ? "Unlike article" : "Like article"}
                  >
                    <span aria-hidden="true">{article.likedByCurrentUser ? "♥" : "♡"}</span>
                    <span>{article.likes}</span>
                  </button>
                  <button
                    className="icon-action-pill"
                    onClick={() => {
                      setActiveCommentsArticleId(article.id);
                      setCommentSortMode("top");
                    }}
                    aria-label="Open comments"
                  >
                    <span aria-hidden="true">💬</span>
                    <span>{article.comments.length}</span>
                  </button>
                  <button
                    className={`bookmark-button ${article.saved ? "bookmark-button-active" : ""}`}
                    onClick={() => handleToggleSaveArticle(article)}
                    disabled={activeSaveArticleId === article.id}
                    aria-label={article.saved ? "Remove bookmark" : "Save article"}
                  >
                    {activeSaveArticleId === article.id ? "…" : article.saved ? "🔖" : "📑"}
                  </button>
                </div>

                <div className="trending-card-actions">
                  <ShareButton
                    path={`/article/${article.id}`}
                    title={article.title}
                    url={article.url}
                  />
                </div>
              </article>

              {(index + 1) % 3 === 0 ? (
                <AdSlot
                  title="Sponsored placement"
                  copy="This is a clean mobile ad placeholder. Swap in your ad network creative or partner placement later."
                  cta="Learn more"
                />
              ) : null}

              {sortMode === "trending" &&
              (index + 1) % 5 === 0 &&
              videos.length > 0 ? (
                <VideoFeedCard
                  video={videos[Math.floor((index + 1) / 5 - 1) % videos.length]}
                  onToggleLike={handleToggleVideoLike}
                  onToggleSave={handleToggleVideoSave}
                  onOpenComments={setActiveCommentsVideoId}
                  onOpenPlayer={setActiveVideoId}
                  label="Video"
                  className="video-card-inline"
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {activeCommentsArticle ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="comments-sheet-title"
        >
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" aria-hidden="true" />

            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="comments-sheet-title" className="modal-title">
                  Comments
                </h3>
                <p className="muted bottom-sheet-title">
                  {activeCommentsArticle.title}
                </p>
              </div>

              <button
                className="button button-secondary"
                onClick={() => setActiveCommentsArticleId(null)}
              >
                Close
              </button>
            </div>

            <div className="toolbar comment-sort-tabs">
              <button
                className={`toolbar-pill ${
                  commentSortMode === "top" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setCommentSortMode("top")}
              >
                Top comments
              </button>
              <button
                className={`toolbar-pill ${
                  commentSortMode === "controversial" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setCommentSortMode("controversial")}
              >
                Controversial
              </button>
              <button
                className={`toolbar-pill ${
                  commentSortMode === "newest" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setCommentSortMode("newest")}
              >
                Newest
              </button>
            </div>

            <div className="input-row bottom-sheet-input-row">
              <input
                className="input"
                type="text"
                placeholder="Write a comment..."
                value={commentInputs[activeCommentsArticle.id] || ""}
                onChange={(e) =>
                  handleCommentInputChange(activeCommentsArticle.id, e.target.value)
                }
              />
              <button
                className="button button-secondary"
                onClick={() => handleAddComment(activeCommentsArticle.id)}
              >
                Add Comment
              </button>
            </div>

            <div className="bottom-sheet-comments">
              {displayedBottomSheetComments.length === 0 ? (
                <div className="empty-state">
                  <strong>No comments yet</strong>
                  <span>Start the conversation on this story.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {displayedBottomSheetComments.map((comment) => (
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
                        {comment.user_id === userId ? (
                          <span className="chip">Your comment</span>
                        ) : null}
                      </div>
                      <div className="comment-body">{comment.text}</div>
                      <div className="comment-meta">
                        {formatRelativeTime(comment.created_at)}
                      </div>
                      <div className="comment-reaction-row">
                        <button
                          className={`comment-reaction-pill ${
                            comment.currentUserReaction === "like"
                              ? "comment-reaction-pill-active"
                              : ""
                          }`}
                          onClick={() =>
                            handleCommentReaction(
                              activeCommentsArticle.id,
                              comment.id,
                              "like"
                            )
                          }
                          disabled={activeCommentAction === `reaction-${comment.id}`}
                        >
                          <span aria-hidden="true">♥</span>
                          <span>{comment.likes}</span>
                        </button>
                        <button
                          className={`comment-reaction-pill ${
                            comment.currentUserReaction === "dislike"
                              ? "comment-reaction-pill-active"
                              : ""
                          }`}
                          onClick={() =>
                            handleCommentReaction(
                              activeCommentsArticle.id,
                              comment.id,
                              "dislike"
                            )
                          }
                          disabled={activeCommentAction === `reaction-${comment.id}`}
                        >
                          <span aria-hidden="true">👎</span>
                          <span>{comment.dislikes}</span>
                        </button>
                      </div>
                      <div className="comment-actions">
                        <button
                          className="comment-action"
                          onClick={() => openReportModal(comment.id)}
                          disabled={activeCommentAction === `report-${comment.id}`}
                        >
                          {activeCommentAction === `report-${comment.id}`
                            ? "Reporting..."
                            : "Report"}
                        </button>

                        {comment.user_id === userId ? (
                          <button
                            className="comment-action comment-action-danger"
                            onClick={() =>
                              openDeleteModal(activeCommentsArticle.id, comment.id)
                            }
                            disabled={activeCommentAction === `delete-${comment.id}`}
                          >
                            {activeCommentAction === `delete-${comment.id}`
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        ) : comment.user_id ? (
                          <button
                            className="comment-action"
                            onClick={() =>
                              handleBlockUser(comment.user_id!, comment.username)
                            }
                            disabled={activeCommentAction === `block-${comment.user_id}`}
                          >
                            {activeCommentAction === `block-${comment.user_id}`
                              ? "Blocking..."
                              : "Block"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeCommentsVideo ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-comments-title"
        >
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="video-comments-title" className="modal-title">
                  Video comments
                </h3>
                <p className="muted bottom-sheet-title">{activeCommentsVideo.title}</p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setActiveCommentsVideoId(null)}
              >
                Close
              </button>
            </div>

            <div className="empty-state">
              <strong>Placeholder discussion</strong>
              <span>
                This feed uses real YouTube news videos. For now, comments remain
                a lightweight placeholder instead of syncing YouTube comment threads.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeVideo ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trending-video-player-title"
        >
          <div className="modal-card video-modal-card">
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="trending-video-player-title" className="modal-title">
                  {activeVideo.title}
                </h3>
                <p className="muted bottom-sheet-title">{activeVideo.creator}</p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setActiveVideoId(null)}
              >
                Close
              </button>
            </div>

            {activeVideo.embedUrl ? (
              <div className="video-player-shell">
                <iframe
                  src={buildVideoEmbedUrl(activeVideo.youtubeId, true)}
                  title={activeVideo.title}
                  className="video-player-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="empty-state">
                <strong>Placeholder video</strong>
                <span>Real YouTube videos will appear here when the API is available.</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="report-title" className="modal-title">
                Report comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Tell us why this comment should be reviewed.
              </p>
            </div>

            <textarea
              className="textarea"
              placeholder="Add a reason for this report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              disabled={activeCommentAction === `report-${reportingCommentId}`}
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
                onClick={closeReportModal}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button button-accent"
                onClick={handleSubmitReport}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                {activeCommentAction === `report-${reportingCommentId}`
                  ? "Submitting..."
                  : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="delete-title" className="modal-title">
                Delete comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to delete this comment?
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={closeDeleteModal}
                disabled={activeCommentAction === `delete-${deleteTarget.commentId}`}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger"
                onClick={confirmDeleteComment}
                disabled={activeCommentAction === `delete-${deleteTarget.commentId}`}
              >
                {activeCommentAction === `delete-${deleteTarget.commentId}`
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
