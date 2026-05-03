"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import ShareButton from "../../components/share-button";
import SourceRatingSheet from "../../components/source-rating-sheet";
import SourceBadge from "../../components/source-badge";
import { ensureProfileRow } from "../../../lib/profile-store";
import { isCommentAllowed } from "../../../lib/moderation";
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
  likes: number;
  dislikes: number;
  currentUserReaction: "like" | "dislike" | null;
  replies: CommentReply[];
};

type CommentReply = {
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

type SummaryItem = {
  label: string;
  text: string;
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

const COMPARE_SOURCES_TUTORIAL_KEY = "reflekt-compare-sources-tutorial-seen";

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

function normalizeSummaryText(value: string) {
  return value
    .replace(/\[\+\d+\s+chars\]/gi, "")
    .replace(/(\.\.\.|…)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDateline(text: string) {
  const match = text.match(
    /^([A-Z][A-Z\s.'-]{2,40}(?:\s*\([A-Z]+\))?)\s+[—-]\s+/
  );

  if (!match) {
    return {
      dateline: null as string | null,
      remainder: text,
    };
  }

  return {
    dateline: match[1].trim(),
    remainder: text.slice(match[0].length).trim(),
  };
}

function cleanSummarySentence(sentence: string) {
  const cleaned = normalizeSummaryText(sentence)
    .replace(/^[A-Z][A-Z\s.'-]{2,40}(?:\s*\([A-Z]+\))?\s+[—-]\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const withoutTrailingPunctuation = cleaned.replace(/[;:,/-]+$/g, "").trim();
  const finalized = /[.!?]$/.test(withoutTrailingPunctuation)
    ? withoutTrailingPunctuation
    : `${withoutTrailingPunctuation}.`;

  return finalized.charAt(0).toUpperCase() + finalized.slice(1);
}

function trimToLastFullSentence(value: string) {
  const normalized = normalizeSummaryText(value);

  if (!normalized) {
    return "";
  }

  const matches = normalized.match(/[^.!?]+[.!?]/g);

  if (!matches || matches.length === 0) {
    return "";
  }

  return matches.join(" ").trim();
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

function getTitleTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function buildCompareArticles(baseArticle: ArticleRecord, allArticles: ArticleRecord[]) {
  const baseTokens = getTitleTokens(baseArticle.title);

  const rankedArticles = allArticles
    .filter((article) => article.id !== baseArticle.id)
    .map((article) => {
      const candidateTokens = getTitleTokens(article.title);
      let overlapScore = 0;

      baseTokens.forEach((token) => {
        if (candidateTokens.has(token)) {
          overlapScore += 1;
        }
      });

      const categoryBonus = article.category === baseArticle.category ? 2 : 0;
      const sourcePenalty = article.source === baseArticle.source ? -2 : 0;

      return {
        article,
        score: overlapScore * 4 + categoryBonus + sourcePenalty,
      };
    })
    .sort((left, right) => right.score - left.score);

  const strongMatches = rankedArticles
    .filter((entry) => entry.score > 0)
    .slice(0, 4)
    .map((entry) => entry.article);

  const fallbackMatches =
    strongMatches.length >= 2
      ? strongMatches
      : rankedArticles.slice(0, 4).map((entry) => entry.article);

  return [baseArticle, ...fallbackMatches].slice(0, 5);
}

function sortComments(
  comments: ArticleComment[],
  mode: "top" | "newest"
) {
  const copied = [...comments];

  if (mode === "newest") {
    return copied.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }

  return copied.sort((a, b) => {
    if (b.likes === a.likes) {
      return b.likes - a.likes;
    }

    return b.likes - a.likes;
  });
}

function buildSummaryItems(
  title: string,
  description?: string | null,
  content?: string | null
): SummaryItem[] {
  const normalizedDescription = trimToLastFullSentence(description ?? "");
  const normalizedContent = trimToLastFullSentence(content ?? "");
  const descriptionDateline = extractDateline(normalizedDescription);
  const contentDateline = extractDateline(normalizedContent);
  const dateline = descriptionDateline.dateline ?? contentDateline.dateline;

  const combinedText = [descriptionDateline.remainder, contentDateline.remainder]
    .filter(Boolean)
    .join(" ");

  const sentenceMatches = combinedText.match(/[^.!?]+[.!?]?/g) ?? [];
  const uniquePoints: string[] = [];

  sentenceMatches.forEach((sentence) => {
    const cleanedSentence = cleanSummarySentence(sentence);

    if (!cleanedSentence) {
      return;
    }

    const alreadyIncluded = uniquePoints.some(
      (existing) => existing.toLowerCase() === cleanedSentence.toLowerCase()
    );

    if (
      !alreadyIncluded &&
      cleanedSentence.length >= 24 &&
      uniquePoints.length < 4
    ) {
      uniquePoints.push(cleanedSentence);
    }
  });

  const titleFallback = cleanSummarySentence(title) || `${title}.`;

  if (uniquePoints.length === 0) {
    uniquePoints.push(titleFallback);
  }

  const fallbackCandidates = [
    normalizedDescription ? cleanSummarySentence(normalizedDescription) : "",
    normalizedContent ? cleanSummarySentence(normalizedContent) : "",
  ].filter(Boolean);

  fallbackCandidates.forEach((candidate) => {
    const alreadyIncluded = uniquePoints.some(
      (existing) => existing.toLowerCase() === candidate.toLowerCase()
    );

    if (!alreadyIncluded && uniquePoints.length < 4) {
      uniquePoints.push(candidate);
    }
  });

  if (dateline && uniquePoints.length > 0) {
    const firstPoint = uniquePoints[0].replace(/^[—-]\s*/, "");
    uniquePoints[0] = `${dateline} — ${firstPoint.charAt(0).toLowerCase()}${firstPoint.slice(1)}`;
    uniquePoints[0] =
      uniquePoints[0].charAt(0).toUpperCase() + uniquePoints[0].slice(1);
  }

  const labels = [
    "What happened",
    "Why it matters",
    "Key detail",
    "What’s next",
  ];

  return uniquePoints
    .slice(0, Math.min(labels.length, Math.max(3, uniquePoints.length)))
    .map((text, index) => ({
      label: labels[index] ?? "Key point",
      text,
    }))
    .filter((item) => item.text);
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const articleId = Number(params.id);
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [likedByCurrentUser, setLikedByCurrentUser] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likedSources, setLikedSources] = useState<string[]>([]);
  const [dislikedSources, setDislikedSources] = useState<string[]>([]);
  const [compareArticles, setCompareArticles] = useState<ArticleRecord[]>([]);
  const [activeCompareIndex, setActiveCompareIndex] = useState(0);
  const [showCompareTutorial, setShowCompareTutorial] = useState(false);
  const [isSourceSheetOpen, setIsSourceSheetOpen] = useState(false);
  const [isSavingSourceRating, setIsSavingSourceRating] = useState(false);
  const [sourceRatingStatus, setSourceRatingStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [commentSortMode, setCommentSortMode] = useState<"top" | "newest">("top");
  const [isCommentSortSheetOpen, setIsCommentSortSheetOpen] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    commentId: number;
    username: string | null;
  } | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [commentActionTarget, setCommentActionTarget] = useState<ArticleComment | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const commentsSectionRef = useRef<HTMLElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const compareTouchStartRef = useRef<{ x: number; y: number } | null>(null);

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

      if (userData.user?.id) {
        const { data: profile, error: profileError } = await ensureProfileRow({
          id: userData.user.id,
          email: userData.user.email ?? null,
        });

        if (profileError) {
          console.error("Error loading article profile:", profileError);
        }

        setUsername(profile?.username ?? null);
      } else {
        setUsername(null);
        setLikedSources([]);
        setDislikedSources([]);
      }

      const newsRes = await fetch("/api/news");

      if (!newsRes.ok) {
        console.error("[Article detail] Failed to fetch news payload", {
          articleId,
          status: newsRes.status,
        });
      }

      const newsData = (await newsRes.json()) as ArticleRecord[];
      const targetArticle =
        newsData.find((item) => item.id === articleId) ?? null;

      if (targetArticle) {
        const nextCompareArticles = buildCompareArticles(targetArticle, newsData);
        setCompareArticles(nextCompareArticles);
        setActiveCompareIndex(0);
        if (
          nextCompareArticles.length > 1 &&
          typeof window !== "undefined" &&
          window.localStorage.getItem(COMPARE_SOURCES_TUTORIAL_KEY) !== "true"
        ) {
          setShowCompareTutorial(true);
        } else {
          setShowCompareTutorial(false);
        }
      } else {
        setCompareArticles([]);
        setActiveCompareIndex(0);
        setShowCompareTutorial(false);
      }

      const legacyArticleId = targetArticle
        ? newsData.findIndex((item) => item.id === targetArticle.id) + 1
        : null;
      const articleIdCandidates = Array.from(
        new Set(
          [articleId, legacyArticleId]
            .map((value) => normalizeArticleId(value))
            .filter((value): value is number => value !== null)
        )
      );

      const [likesRes, commentsRes, profilesRes] = await Promise.all([
        supabase
          .from("likes")
          .select("id, article_id, user_id")
          .eq("article_id", articleId),
        supabase
          .from("comments")
          .select("id, article_id, user_id, username, text, created_at")
          .in("article_id", articleIdCandidates),
        supabase.from("profiles").select("id, avatar_url"),
      ]);

      if (likesRes.error) {
        console.error("[Article detail] Failed to fetch likes", {
          articleId,
          error: likesRes.error,
        });
      }

      if (commentsRes.error) {
        console.error("[Article detail] Failed to fetch comments", {
          articleId,
          articleIdType: typeof articleId,
          articleIdCandidates,
          error: commentsRes.error,
        });
      }

      if (profilesRes.error) {
        console.error("[Article detail] Failed to fetch profile avatars for comments", {
          articleId,
          error: profilesRes.error,
        });
      }

      const rawComments = (commentsRes.data ?? []) as DbComment[];
      const commentIds = rawComments.map((comment) => comment.id);
      const [reactionsRes, repliesRes] = commentIds.length
        ? await Promise.all([
            supabase
              .from("comment_reactions")
              .select("id, comment_id, user_id, reaction_type")
              .in("comment_id", commentIds),
            supabase
              .from("comment_replies")
              .select("id, comment_id, article_id, text, username, user_id, created_at")
              .in("comment_id", commentIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

      if (reactionsRes.error) {
        console.error("[Article detail] Failed to fetch comment reactions", {
          articleId,
          commentIds,
          error: reactionsRes.error,
        });
      }

      if (repliesRes.error) {
        console.error("[Article detail] Failed to fetch comment replies", {
          articleId,
          articleIdCandidates,
          commentIds,
          error: repliesRes.error,
        });
      }

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
      const { data: sourceRatingsData } = currentUserId
        ? await supabase
            .from("source_ratings")
            .select("source_name, rating")
            .eq("user_id", currentUserId)
        : { data: [] as { source_name: string; rating: "like" | "dislike" }[] };

      const likes = (likesRes.data ?? []) as DbLike[];
      const commentReactions = (reactionsRes.data ?? []) as DbCommentReaction[];
      const commentReplies = (repliesRes.data ?? []) as DbCommentReply[];
      const profiles = (profilesRes.data ?? []) as DbProfile[];
      const blockedIds = new Set(
        ((blockedUsersData ?? []) as DbBlockedUser[]).map(
          (blockedUser) => blockedUser.blocked_user_id
        )
      );
      const avatarLookup = new Map(
        profiles.map((profile) => [profile.id, profile.avatar_url])
      );
      const sourceRatings = (sourceRatingsData ?? []) as {
        source_name: string;
        rating: "like" | "dislike";
      }[];

      setArticle(targetArticle);
      setLikesCount(likes.length);
      setLikedByCurrentUser(
        likes.some((like) => like.user_id && like.user_id === currentUserId)
      );
      setIsSaved(Boolean(savedArticlesData));
      setLikedSources(
        sourceRatings
          .filter((rating) => rating.rating === "like")
          .map((rating) => rating.source_name)
      );
      setDislikedSources(
        sourceRatings
          .filter((rating) => rating.rating === "dislike")
          .map((rating) => rating.source_name)
      );
      setComments(
        rawComments
          .filter(
            (comment) => {
              const normalizedCommentArticleId = normalizeArticleId(comment.article_id);

              return (
                normalizedCommentArticleId !== null &&
                articleIdCandidates.includes(normalizedCommentArticleId) &&
                (!comment.user_id || !blockedIds.has(comment.user_id))
              );
            }
          )
          .map((comment) => {
            const reactions = commentReactions.filter(
              (reaction) => reaction.comment_id === comment.id
            );
            const replies = commentReplies
              .filter(
                (reply) =>
                  reply.comment_id === comment.id &&
                  articleIdCandidates.includes(
                    normalizeArticleId(reply.article_id) ?? Number.NaN
                  ) &&
                  (!reply.user_id || !blockedIds.has(reply.user_id))
              )
              .map((reply) => ({
                id: reply.id,
                comment_id: reply.comment_id,
                article_id: normalizeArticleId(reply.article_id) ?? articleId,
                text: reply.text,
                username: reply.username,
                user_id: reply.user_id,
                created_at: reply.created_at,
                avatar_url: reply.user_id
                  ? avatarLookup.get(reply.user_id) ?? null
                  : null,
              }));

            return {
              id: comment.id,
              text: comment.text,
              username: comment.username,
              user_id: comment.user_id,
              created_at: comment.created_at,
              avatar_url: comment.user_id
                ? avatarLookup.get(comment.user_id) ?? null
                : null,
              likes: reactions.filter((reaction) => reaction.reaction_type === "like")
                .length,
              dislikes: reactions.filter((reaction) => reaction.reaction_type === "dislike")
                .length,
              currentUserReaction:
                reactions.find((reaction) => reaction.user_id === currentUserId)
                  ?.reaction_type ?? null,
              replies,
            };
          })
      );
      setIsLoading(false);
    }

    loadArticle();
  }, [articleId]);

  useEffect(() => {
    if (typeof window === "undefined" || comments.length === 0) {
      return;
    }

    const hash = window.location.hash;

    window.requestAnimationFrame(() => {
      if (hash === "#comments") {
        commentsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        window.setTimeout(() => {
          commentInputRef.current?.focus();
        }, 220);
        return;
      }

      if (!hash.startsWith("#comment-")) {
        return;
      }

      const target = document.querySelector(hash);

      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [comments]);

  useEffect(() => {
    if (replyTarget) {
      commentInputRef.current?.focus();
    }
  }, [replyTarget]);

  useEffect(() => {
    const handleArticleCommentSortToggle = () => {
      setIsCommentSortSheetOpen((current) => !current);
    };

    window.addEventListener(
      "reflekt:article-comment-sort-toggle",
      handleArticleCommentSortToggle
    );

    return () => {
      window.removeEventListener(
        "reflekt:article-comment-sort-toggle",
        handleArticleCommentSortToggle
      );
    };
  }, []);

  const activeCompareArticle = compareArticles[activeCompareIndex] ?? article;

  useEffect(() => {
    if (!activeCompareArticle?.source) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("reflekt:article-source", {
        detail: activeCompareArticle.source,
      })
    );
  }, [activeCompareArticle?.source]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("reflekt:article-url", {
        detail: article?.url ?? null,
      })
    );
  }, [article?.url]);

  useEffect(() => {
    if (!showCompareTutorial) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
      }
      setShowCompareTutorial(false);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showCompareTutorial]);

  const displayedComments = useMemo(
    () => sortComments(comments, commentSortMode),
    [commentSortMode, comments]
  );

  const createNotification = async ({
    recipientUserId,
    type,
    commentId,
    replyId,
  }: {
    recipientUserId: string | null;
    type: "comment_like" | "comment_reply";
    commentId: number;
    replyId?: number | null;
  }) => {
    if (!userId || !recipientUserId || recipientUserId === userId) {
      return;
    }

    const { error } = await supabase.from("notifications").insert({
      recipient_user_id: recipientUserId,
      actor_user_id: userId,
      type,
      article_id: articleId,
      comment_id: commentId,
      reply_id: replyId ?? null,
    });

    if (error) {
      console.error("Error creating notification:", error);
    }
  };

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
        alert(error.message ?? "Could not remove saved article");
        return;
      }

      setIsSaved(false);
      return;
    }

    const { error } = await supabase.from("saved_articles").upsert(
      {
        user_id: userId,
        article_id: article.id,
        title: article.title,
        source: article.source,
        category: article.category,
        time: article.time,
        url: article.url ?? null,
        image: article.image ?? null,
        published_at: article.publishedAt ?? null,
      },
      {
        onConflict: "user_id,article_id",
      }
    );

    if (error) {
      console.error("Error saving article:", error);
      alert(error.message ?? "Could not save article");
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

  const handleSaveSourceRating = async (rating: "like" | "dislike") => {
    const activeSourceName = activeCompareArticle?.source ?? article?.source;

    if (!activeSourceName) {
      return;
    }

    if (!userId) {
      setSourceRatingStatus({
        type: "error",
        text: "Log in to rate sources.",
      });
      return;
    }

    const sourceName = activeSourceName;
    const currentRating = likedSources.includes(sourceName)
      ? "like"
      : dislikedSources.includes(sourceName)
        ? "dislike"
        : null;

    setIsSavingSourceRating(true);
    setSourceRatingStatus(null);

    if (currentRating === rating) {
      const { error } = await supabase
        .from("source_ratings")
        .delete()
        .eq("user_id", userId)
        .eq("source_name", sourceName);

      setIsSavingSourceRating(false);

      if (error) {
        console.error("Error clearing source rating:", error);
        setSourceRatingStatus({
          type: "error",
          text: error.message ?? "Could not update source rating.",
        });
        return;
      }

      setLikedSources((prev) => prev.filter((current) => current !== sourceName));
      setDislikedSources((prev) => prev.filter((current) => current !== sourceName));
      setSourceRatingStatus({
        type: "success",
        text: "Source rating cleared.",
      });
      return;
    }

    const { error } = await supabase.from("source_ratings").upsert(
      {
        user_id: userId,
        source_name: sourceName,
        rating,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,source_name",
      }
    );

    setIsSavingSourceRating(false);

    if (error) {
      console.error("Error saving source rating:", error);
      setSourceRatingStatus({
        type: "error",
        text: error.message ?? "Could not save source rating.",
      });
      return;
    }

    setLikedSources((prev) =>
      rating === "like"
        ? [...prev.filter((current) => current !== sourceName), sourceName]
        : prev.filter((current) => current !== sourceName)
    );
    setDislikedSources((prev) =>
      rating === "dislike"
        ? [...prev.filter((current) => current !== sourceName), sourceName]
        : prev.filter((current) => current !== sourceName)
    );
    setSourceRatingStatus({
      type: "success",
      text: "Source rating updated.",
    });
  };

  const handleAddComment = async () => {
    const text = commentInput.trim();

    if (!text) {
      return;
    }

    if (!userId) {
      alert("Log in to comment");
      return;
    }

    if (!username) {
      alert("Set a username on your Profile page first");
      return;
    }

    if (!isCommentAllowed(text)) {
      alert("Please edit your comment before posting.");
      return;
    }

    if (replyTarget) {
      const parentComment = comments.find((comment) => comment.id === replyTarget.commentId);

      if (!parentComment) {
        setReplyTarget(null);
        return;
      }

      const { data, error } = await supabase
        .from("comment_replies")
        .insert({
          comment_id: replyTarget.commentId,
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving reply:", error);
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
                    article_id: data.article_id,
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

      void createNotification({
        recipientUserId: parentComment.user_id,
        type: "comment_reply",
        commentId: replyTarget.commentId,
        replyId: data.id,
      });

      setCommentInput("");
      setReplyTarget(null);
      return;
    }

    const targetArticle = compareArticle ?? article;

    const { data, error } = await supabase
      .from("comments")
      .insert({
        article_id: articleId,
        article_title: targetArticle?.title ?? null,
        article_source: targetArticle?.source ?? null,
        article_image: targetArticle?.image ?? null,
        article_url: targetArticle?.url ?? null,
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

    setComments((prev) => [
      ...prev,
      {
        id: data.id,
        text: data.text,
        username: data.username,
        user_id: data.user_id,
        created_at: data.created_at,
        avatar_url: null,
        likes: 0,
        dislikes: 0,
        currentUserReaction: null,
        replies: [],
      },
    ]);
    setCommentInput("");
  };

  const handleCommentReaction = async (commentId: number) => {
    if (!userId) {
      alert("Log in to react to comments");
      return;
    }

    const targetComment = comments.find((comment) => comment.id === commentId);

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

    if (existingReaction?.reaction_type === "like") {
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

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: Math.max(0, comment.likes - 1),
                currentUserReaction: null,
              }
            : comment
        )
      );
      return;
    }

    if (existingReaction) {
      const { error } = await supabase
        .from("comment_reactions")
        .update({ reaction_type: "like" })
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error updating comment reaction:", error);
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: comment.likes + (existingReaction.reaction_type === "like" ? 0 : 1),
                dislikes:
                  existingReaction.reaction_type === "dislike"
                    ? Math.max(0, comment.dislikes - 1)
                    : comment.dislikes,
                currentUserReaction: "like",
              }
            : comment
        )
      );

      if (existingReaction.reaction_type !== "like") {
        void createNotification({
          recipientUserId: targetComment.user_id,
          type: "comment_like",
          commentId,
        });
      }
      return;
    }

    const { error } = await supabase.from("comment_reactions").insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: "like",
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error creating comment reaction:", error);
      return;
    }

    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              likes: comment.likes + 1,
              currentUserReaction: "like",
            }
          : comment
      )
    );

    void createNotification({
      recipientUserId: targetComment.user_id,
      type: "comment_like",
      commentId,
    });
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
      console.error("Error deleting comment:", error);
      return;
    }

    setComments((prev) => prev.filter((comment) => comment.id !== deleteCommentId));
    setDeleteCommentId(null);
  };

  const openCommentActionSheet = (comment: ArticleComment) => {
    setCommentActionTarget(comment);
  };

  const startCommentLongPress = (comment: ArticleComment) => {
    window.clearTimeout(longPressTimerRef.current ?? undefined);
    longPressTimerRef.current = window.setTimeout(() => {
      openCommentActionSheet(comment);
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

  const handleCompareSwipe = (direction: "left" | "right") => {
    if (compareArticles.length <= 1) {
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
    }
    setShowCompareTutorial(false);
    setActiveCompareIndex((current) => {
      if (direction === "left") {
        return Math.min(compareArticles.length - 1, current + 1);
      }

      return Math.max(0, current - 1);
    });
  };

  const handleCompareTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    compareTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleCompareTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = compareTouchStartRef.current;

    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    const diffX = touch.clientX - start.x;
    const diffY = touch.clientY - start.y;
    compareTouchStartRef.current = null;

    if (Math.abs(diffX) < 48 || Math.abs(diffX) <= Math.abs(diffY)) {
      return;
    }

    handleCompareSwipe(diffX < 0 ? "left" : "right");
  };

  const dismissCompareTutorial = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
    }
    setShowCompareTutorial(false);
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

  const compareArticle = activeCompareArticle ?? article;
  const rawContent = compareArticle.content?.trim() ?? "";
  const rawDescription = compareArticle.description?.trim() ?? "";
  const cleanedContent = rawContent
    .replace(/\s*\[\+\d+\s+chars\]\s*$/i, "")
    .replace(/(\.\.\.|…)\s*$/g, "")
    .trim();
  const summaryItems = buildSummaryItems(
    compareArticle.title,
    rawDescription,
    cleanedContent
  );

  return (
    <section className="page-shell article-page-shell">
      {showCompareTutorial ? (
        <div
          className="compare-sources-tutorial-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Dismiss compare sources tutorial"
          onClick={dismissCompareTutorial}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dismissCompareTutorial();
            }
          }}
        >
          <div className="compare-sources-tutorial-card">
            <div className="compare-sources-tutorial-label">
              Swipe to compare sources
            </div>
            <div className="compare-sources-tutorial-motion" aria-hidden="true">
              <span className="compare-sources-tutorial-arrow">←</span>
              <span className="compare-sources-tutorial-hand">☞</span>
              <span className="compare-sources-tutorial-arrow">→</span>
            </div>
          </div>
        </div>
      ) : null}

      {compareArticles.length > 1 ? (
        <div className="compare-sources-top-row" aria-hidden="true">
          <div className="compare-sources-dots">
            {compareArticles.map((compareItem, index) => (
              <span
                key={compareItem.id}
                className={`compare-sources-dot ${
                  index === activeCompareIndex ? "compare-sources-dot-active" : ""
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}

      <section
        className="section-card article-detail-hero compare-sources-shell"
        onTouchStart={handleCompareTouchStart}
        onTouchEnd={handleCompareTouchEnd}
      >
        <div className="stack" style={{ gap: "10px" }}>
          <div className="article-detail-kicker-row">
            <button
              type="button"
              className="source-trigger article-detail-source-wrap"
              onClick={() => {
                setIsSourceSheetOpen(true);
                setSourceRatingStatus(null);
              }}
            >
              <SourceBadge sourceName={compareArticle.source} />
              <span className="article-detail-source">{compareArticle.source}</span>
            </button>
            <span className="chip chip-accent">{compareArticle.category}</span>
          </div>
          <h2 className="article-detail-title">{compareArticle.title}</h2>
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
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                  fill={likedByCurrentUser ? "currentColor" : "none"}
                />
              </svg>
            </span>
            <span>{likesCount}</span>
          </button>
          <button
            className="icon-action-pill"
            aria-label="Comments"
            onClick={() => {
              scrollToComments();
              setIsCommentSortSheetOpen(false);
              setReplyTarget(null);
            }}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
              </svg>
            </span>
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
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                  fill={isSaved ? "currentColor" : "none"}
                />
              </svg>
            </span>
          </button>
        </div>

        <div className="article-detail-body">
          <div className="article-detail-section article-summary-section">
            <p className="article-detail-label">Summary</p>
            <p className="article-summary-note">AI-assisted summary</p>
            <ul className="article-summary-list">
              {summaryItems.map((item) => (
                <li key={`${item.label}-${item.text}`} className="article-summary-item">
                  <strong>{item.label}:</strong> {item.text}
                </li>
              ))}
            </ul>
          </div>
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
              <span>Start the conversation on this story.</span>
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
                    openCommentActionSheet(comment);
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
                                          (reply.username ?? "U")
                                            .charAt(0)
                                            .toUpperCase()
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
                        onClick={() => handleCommentReaction(comment.id)}
                        disabled={activeCommentAction === `reaction-${comment.id}`}
                        aria-label={
                          comment.currentUserReaction === "like"
                            ? "Remove heart"
                            : "Heart comment"
                        }
                      >
                        <span className="comment-reaction-glyph" aria-hidden="true">
                          <svg {...actionIconProps}>
                            <path
                              d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                              fill={
                                comment.currentUserReaction === "like"
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </svg>
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

      {isCommentSortSheetOpen ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Choose comment sort"
          onClick={() => setIsCommentSortSheetOpen(false)}
        >
          <div
            className="bottom-sheet article-comment-sort-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="stack" style={{ gap: "6px" }}>
              <h3 className="modal-title">Sort comments</h3>
              <p className="muted bottom-sheet-title">
                Choose how comments should be ordered.
              </p>
            </div>
            <div className="source-sheet-actions">
              {[
                { value: "top" as const, label: "Top comments" },
                { value: "newest" as const, label: "Newest" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`button source-sheet-button article-comment-sort-option ${
                    commentSortMode === option.value
                      ? "article-comment-sort-option-active"
                      : "button-secondary"
                  }`}
                  onClick={() => {
                    setCommentSortMode(option.value);
                    setIsCommentSortSheetOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {commentSortMode === option.value ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
              <button
                className="button button-secondary source-sheet-close"
                onClick={() => setIsCommentSortSheetOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SourceRatingSheet
        sourceName={compareArticle.source}
        isOpen={isSourceSheetOpen}
        currentRating={
          likedSources.includes(compareArticle.source)
            ? "like"
            : dislikedSources.includes(compareArticle.source)
              ? "dislike"
              : null
        }
        isSaving={isSavingSourceRating}
        status={sourceRatingStatus}
        onLike={() => {
          void handleSaveSourceRating("like");
        }}
        onDislike={() => {
          void handleSaveSourceRating("dislike");
        }}
        onClose={() => {
          if (isSavingSourceRating) {
            return;
          }

          setIsSourceSheetOpen(false);
          setSourceRatingStatus(null);
        }}
      />

      {commentActionTarget ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comment actions"
          onClick={() => setCommentActionTarget(null)}
        >
          <div className="bottom-sheet action-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="source-sheet-actions">
              <button
                className="button button-secondary source-sheet-button"
                onClick={() => {
                  setReportingCommentId(commentActionTarget.id);
                  setCommentActionTarget(null);
                }}
              >
                Report
              </button>
              {commentActionTarget.user_id === userId ? (
                <button
                  className="button comment-action-danger source-sheet-button"
                  onClick={() => {
                    setDeleteCommentId(commentActionTarget.id);
                    setCommentActionTarget(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button
                className="button button-secondary source-sheet-close"
                onClick={() => setCommentActionTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="article-report-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="article-report-title" className="modal-title">
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
                onClick={() => {
                  setReportingCommentId(null);
                  setReportStatus(null);
                  setReportReason("");
                }}
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

      {deleteCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="article-delete-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="article-delete-title" className="modal-title">
                Delete comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to delete this comment?
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setDeleteCommentId(null)}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger"
                onClick={handleDeleteComment}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                {activeCommentAction === `delete-${deleteCommentId}` ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
