"use client";

import AdSlot from "./components/ad-slot";
import LoadingScreen from "./components/loading-screen";
import SourceRatingSheet from "./components/source-rating-sheet";
import SourceBadge from "./components/source-badge";
import VideoFeedCard from "./components/video-feed-card";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShareButton from "./components/share-button";
import {
  createBlockedUser,
  listBlockedUsers,
  listMutuallyHiddenUserIds,
} from "../lib/blocked-users";
import { ensureProfileRow, saveProfilePatch } from "../lib/profile-store";
import { isCommentAllowed } from "../lib/moderation";
import { supabase } from "../lib/supabase";
import { rankArticlesWithSourcePreferences } from "../lib/feed-ranking";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../lib/categories";
import {
  buildVideoEmbedUrl,
  initialVideos,
  normalizeVideoFeedItems,
  type VideoApiItem,
  type VideoItem,
} from "../lib/video-feed";

const FEED_PAGE_SIZE = 30;

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
  replies: Reply[];
};

type Reply = {
  id: number;
  comment_id: number;
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

type Article = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
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
  preferred_sources?: string[] | null;
  show_less_sources?: string[] | null;
};

type DbSavedArticle = {
  article_id: number;
};

type DbBlockedUser = {
  blocked_id: string;
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
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbSourceRating = {
  id: string;
  user_id: string;
  source_name: string;
  rating: "like" | "dislike";
};

type FeedArticlePayload = Omit<
  Article,
  "likes" | "likeUsers" | "likedByCurrentUser" | "comments" | "saved"
>;

type PaginatedNewsResponse = {
  articles: FeedArticlePayload[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const HOME_FALLBACK_ARTICLES: FeedArticlePayload[] = [
  {
    id: 910001,
    title: "Congress returns with a packed agenda on budget, border, and aid talks",
    source: "Associated Press",
    category: "Politics",
    time: "Recent",
    image: null,
    imageUrl: null,
    urlToImage: null,
    description:
      "Lawmakers head back to Washington facing another week of negotiations on domestic priorities and international funding.",
    url: "https://graffiti.app/fallback/910001",
    publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    content:
      "Lawmakers head back to Washington facing another week of negotiations on domestic priorities and international funding.",
  },
  {
    id: 910002,
    title: "Wall Street watches bond yields, oil prices, and earnings for fresh signals",
    source: "Reuters",
    category: "Finance",
    time: "Recent",
    image: null,
    imageUrl: null,
    urlToImage: null,
    description:
      "Investors are tracking rates, commodities, and corporate outlooks as markets look for direction.",
    url: "https://graffiti.app/fallback/910002",
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    content:
      "Investors are tracking rates, commodities, and corporate outlooks as markets look for direction.",
  },
  {
    id: 910003,
    title: "Tech companies push new AI features while regulators weigh guardrails",
    source: "Bloomberg",
    category: "Tech",
    time: "Recent",
    image: null,
    imageUrl: null,
    urlToImage: null,
    description:
      "The latest product rollouts arrive alongside policy questions about safety, transparency, and competition.",
    url: "https://graffiti.app/fallback/910003",
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    content:
      "The latest product rollouts arrive alongside policy questions about safety, transparency, and competition.",
  },
];

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

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

function formatFreshnessTime(
  timestamp: string | null | undefined,
  fallback?: string | null
) {
  if (!timestamp) {
    return fallback ?? "Just now";
  }

  const publishedAt = new Date(timestamp).getTime();

  if (Number.isNaN(publishedAt)) {
    return fallback ?? "Just now";
  }

  const diffMs = Date.now() - publishedAt;
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

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(publishedAt));
}

function getArticleDeduplicationKey(article: Pick<Article, "id" | "url" | "title" | "source">) {
  if (article.url?.trim()) {
    return `url:${article.url.trim().toLowerCase()}`;
  }

  return `id:${article.id}:${article.title.trim().toLowerCase()}:${article.source
    .trim()
    .toLowerCase()}`;
}

function mergeArticlesByIdentity(existing: Article[], incoming: Article[]) {
  const merged = [...existing];
  const existingKeys = new Set(existing.map((article) => getArticleDeduplicationKey(article)));

  incoming.forEach((article) => {
    const dedupeKey = getArticleDeduplicationKey(article);

    if (existingKeys.has(dedupeKey)) {
      return;
    }

    existingKeys.add(dedupeKey);
    merged.push(article);
  });

  return merged;
}

function normalizeNewsPayload(payload: FeedArticlePayload[] | PaginatedNewsResponse) {
  if (Array.isArray(payload)) {
    return {
      articles: payload,
      hasMore: false,
      page: 1,
      pageSize: payload.length,
    };
  }

  return payload;
}

function getArticleCardImage(article: {
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
}) {
  return article.imageUrl || article.urlToImage || article.image || null;
}

function buildClientFallbackArticles() {
  return HOME_FALLBACK_ARTICLES.map((article, index) => ({
    ...article,
    likes: 30 - index * 4,
    likeUsers: [],
    likedByCurrentUser: false,
    comments: [],
    saved: false,
  }));
}

export default function Home() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<"trending" | "my-feed" | "latest">(
    "trending"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [likedSources, setLikedSources] = useState<string[]>([]);
  const [dislikedSources, setDislikedSources] = useState<string[]>([]);
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
  const [commentComposerStatus, setCommentComposerStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [commentSortMode, setCommentSortMode] = useState<
    "top" | "controversial" | "newest"
  >("top");
  const [isCommentSortMenuOpen, setIsCommentSortMenuOpen] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [categorySheetStatus, setCategorySheetStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  const [isSavingSourceRating, setIsSavingSourceRating] = useState(false);
  const [sourceRatingStatus, setSourceRatingStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [feedPage, setFeedPage] = useState(1);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextPageRef = useRef(false);
  const [replyTarget, setReplyTarget] = useState<{
    articleId: number;
    commentId: number;
    username: string | null;
  } | null>(null);

  const loadFeedPage = useCallback(async (pageToLoad: number, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;

    if (!replace && isFetchingNextPageRef.current) {
      return;
    }

    if (replace) {
      setIsLoading(true);
    } else {
      isFetchingNextPageRef.current = true;
      setIsLoadingMoreArticles(true);
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);

      if (userData.user?.id) {
        const { data: profile, error: profileError } = await ensureProfileRow({
          id: userData.user.id,
          email: userData.user.email ?? null,
        });

        if (profileError) {
          console.error("Error loading home profile:", profileError);
        }

        setUsername(profile?.username ?? null);
        setCategories(profile?.categories ?? []);
        setPreferredSources(profile?.preferred_sources ?? []);
        setShowLessSources(profile?.show_less_sources ?? []);
      } else {
        setUsername(null);
        setCategories([]);
        setPreferredSources([]);
        setShowLessSources([]);
        setLikedSources([]);
        setDislikedSources([]);
      }

      const newsRes = await fetch(`/api/news?page=${pageToLoad}&pageSize=${FEED_PAGE_SIZE}`);

      if (!newsRes.ok) {
        throw new Error(`Home feed request failed with status ${newsRes.status}`);
      }

      const newsPayload = normalizeNewsPayload(
        (await newsRes.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );
      const newsData = newsPayload.articles;

      if (replace && newsData.length === 0) {
        console.error("Home feed returned zero articles for page 1.", newsPayload);
      }

      const { data: likesData } = await supabase
        .from("likes")
        .select("id, article_id, user_id");

      const { data: commentsData } = await supabase
        .from("comments")
        .select("id, article_id, text, username, user_id, created_at");

      const { data: commentReactionsData } = await supabase
        .from("comment_reactions")
        .select("id, comment_id, user_id, reaction_type");

      const { data: commentRepliesData } = await supabase
        .from("comment_replies")
        .select("id, comment_id, article_id, text, username, user_id, created_at");

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, avatar_url, username");

      const { data: savedArticlesData } = userData.user?.id
        ? await supabase
            .from("saved_articles")
            .select("article_id")
            .eq("user_id", userData.user.id)
        : { data: [] as DbSavedArticle[] };

      const { data: blockedUsersData, error: blockedUsersError } = userData.user?.id
        ? await listMutuallyHiddenUserIds(supabase, userData.user.id)
        : { data: [] as string[], error: null };
      const { data: ownBlockedUsersData, error: ownBlockedUsersError } = userData.user?.id
        ? await listBlockedUsers(supabase, userData.user.id)
        : { data: [] as DbBlockedUser[], error: null };

      if (blockedUsersError) {
        console.error("Error loading blocked users:", blockedUsersError);
      }

      if (ownBlockedUsersError) {
        console.error("Error loading own blocked users:", ownBlockedUsersError);
      }

      const { data: sourceRatingsData } = userData.user?.id
        ? await supabase
            .from("source_ratings")
            .select("id, user_id, source_name, rating")
            .eq("user_id", userData.user.id)
        : { data: [] as DbSourceRating[] };

      const likes = (likesData ?? []) as DbLike[];
      const comments = (commentsData ?? []) as DbComment[];
      const commentReactions = (commentReactionsData ?? []) as DbCommentReaction[];
      const commentReplies = (commentRepliesData ?? []) as DbCommentReply[];
      const profiles = (profilesData ?? []) as DbProfile[];
      const sourceRatings = (sourceRatingsData ?? []) as DbSourceRating[];
      const blockedIds = new Set((blockedUsersData ?? []) as string[]);
      const savedArticleIds = new Set(
        ((savedArticlesData ?? []) as DbSavedArticle[]).map(
          (savedArticle) => savedArticle.article_id
        )
      );
      const avatarLookup = new Map(profiles.map((profile) => [profile.id, profile.avatar_url]));
      const usernameLookup = new Map(profiles.map((profile) => [profile.id, profile.username]));

      const mergedArticles: Article[] = newsData.map((item) => {
        const articleLikes = likes.filter((like) => like.article_id === item.id).length;
        const articleLikeUsers = likes
          .filter((like) => like.article_id === item.id)
          .map((like) => ({
            user_id: like.user_id,
            username: like.user_id ? usernameLookup.get(like.user_id) ?? null : null,
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
            const replies = commentReplies
              .filter(
                (reply) =>
                  reply.comment_id === comment.id &&
                  (!reply.user_id || !blockedIds.has(reply.user_id))
              )
              .map((reply) => ({
                id: reply.id,
                comment_id: reply.comment_id,
                article_id: reply.article_id,
                text: reply.text,
                username: reply.username,
                user_id: reply.user_id,
                created_at: reply.created_at,
                avatar_url: reply.user_id ? avatarLookup.get(reply.user_id) ?? null : null,
              }));

            return {
              id: comment.id,
              text: comment.text,
              username: comment.username,
              user_id: comment.user_id,
              avatar_url: comment.user_id ? avatarLookup.get(comment.user_id) ?? null : null,
              created_at: comment.created_at,
              likes: reactions.filter((reaction) => reaction.reaction_type === "like")
                .length,
              dislikes: reactions.filter(
                (reaction) => reaction.reaction_type === "dislike"
              ).length,
              currentUserReaction:
                reactions.find((reaction) => reaction.user_id === userData.user?.id)
                  ?.reaction_type ?? null,
              replies,
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

      setBlockedUserIds(
        ((ownBlockedUsersData ?? []) as DbBlockedUser[]).map(
          (blockedUser) => blockedUser.blocked_id
        )
      );
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
      setHasMoreArticles(newsPayload.hasMore);
      setFeedPage(pageToLoad);
      setArticles((prev) =>
        replace ? mergedArticles : mergeArticlesByIdentity(prev, mergedArticles)
      );
    } catch (error) {
      console.error("Error loading feed articles:", error);
      if (replace) {
        setArticles(buildClientFallbackArticles());
        setHasMoreArticles(false);
        setFeedPage(1);
      }
    } finally {
      isFetchingNextPageRef.current = false;
      setIsLoading(false);
      setIsLoadingMoreArticles(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadFeedPage(1, { replace: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadFeedPage]);

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

  useEffect(() => {
    if (replyTarget) {
      commentInputRef.current?.focus();
    }
  }, [replyTarget]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;

    if (!sentinel || isLoading || isLoadingMoreArticles || !hasMoreArticles) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (
          !entry?.isIntersecting ||
          isLoadingMoreArticles ||
          isLoading ||
          !hasMoreArticles ||
          isFetchingNextPageRef.current
        ) {
          return;
        }

        void loadFeedPage(feedPage + 1);
      },
      {
        rootMargin: "320px 0px",
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [feedPage, hasMoreArticles, isLoading, isLoadingMoreArticles, loadFeedPage]);

  const createNotification = useCallback(
    async ({
      recipientUserId,
      type,
      articleId,
      commentId,
      replyId,
    }: {
      recipientUserId: string | null;
      type: "comment_like" | "comment_reply";
      articleId: number;
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
    },
    [userId]
  );

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
        alert(error.message ?? "Could not remove saved article");
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

    const { error } = await supabase.from("saved_articles").upsert(
      {
        user_id: userId,
        article_id: article.id,
        title: article.title,
        source: article.source,
        category: article.category,
        time: article.time,
        url: article.url ?? null,
        image: getArticleCardImage(article),
        published_at: article.publishedAt ?? null,
      },
      {
        onConflict: "user_id,article_id",
      }
    );

    setActiveSaveArticleId(null);

    if (error) {
      console.error("Error saving article:", error);
      alert(error.message ?? "Could not save article");
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
    setCommentComposerStatus(null);
    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: value,
    }));
  };

  const handleAddComment = async (articleId: number) => {
    const text = commentInputs[articleId]?.trim();

    if (!text) {
      setCommentComposerStatus({
        type: "error",
        text: "Write a comment before sending.",
      });
      return;
    }

    if (!userId) {
      setCommentComposerStatus({
        type: "error",
        text: "Log in to comment.",
      });
      return;
    }

    if (!username) {
      setCommentComposerStatus({
        type: "error",
        text: "Set a username on your Profile page first.",
      });
      return;
    }

    if (!isCommentAllowed(text)) {
      setCommentComposerStatus({
        type: "error",
        text: "Please edit your comment before posting.",
      });
      return;
    }

    if (replyTarget && replyTarget.articleId === articleId) {
      const parentComment = articles
        .find((article) => article.id === articleId)
        ?.comments.find((comment) => comment.id === replyTarget.commentId);

      if (!parentComment) {
        setCommentComposerStatus({
          type: "error",
          text: "That comment is no longer available.",
        });
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
        setCommentComposerStatus({
          type: "error",
          text: error.message ?? "Could not save reply.",
        });
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
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
                            avatar_url: null,
                            created_at: data.created_at,
                          },
                        ],
                      }
                    : comment
                ),
              }
            : article
        )
      );

      void createNotification({
        recipientUserId: parentComment.user_id,
        type: "comment_reply",
        articleId,
        commentId: replyTarget.commentId,
        replyId: data.id,
      });

      setCommentInputs((prev) => ({
        ...prev,
        [articleId]: "",
      }));
      setReplyTarget(null);
      setCommentComposerStatus(null);
      return;
    }

    const targetArticle = articles.find((article) => article.id === articleId);

    const fullCommentPayload = {
      article_id: articleId,
      article_title: targetArticle?.title ?? null,
      article_source: targetArticle?.source ?? null,
      article_image: targetArticle ? getArticleCardImage(targetArticle) : null,
      article_url: targetArticle?.url ?? null,
      text,
      user_id: userId,
      username,
    };

    let insertResponse = await supabase
      .from("comments")
      .insert(fullCommentPayload)
      .select()
      .single();

    if (
      insertResponse.error &&
      isMissingCommentMetadataColumnError(insertResponse.error.message)
    ) {
      console.error(
        "Comment insert failed with article metadata payload, retrying without optional columns:",
        insertResponse.error
      );

      insertResponse = await supabase
        .from("comments")
        .insert({
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();
    }

    const { data, error } = insertResponse;

    if (error) {
      console.error("Error saving comment:", error);
      setCommentComposerStatus({
        type: "error",
        text: error.message ?? "Could not save comment.",
      });
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
                  replies: [],
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
    setReplyTarget(null);
    setCommentComposerStatus(null);
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

    const { error, alreadyExists } = await createBlockedUser(
      supabase,
      userId,
      blockedUserId,
      blockedUsername ?? null
    );

    setActiveCommentAction(null);

    if (alreadyExists) {
      alert("User already blocked");
      setBlockedUserIds((prev) =>
        prev.includes(blockedUserId) ? prev : [...prev, blockedUserId]
      );
      return;
    }

    if (error) {
      console.error("Error blocking user:", error);
      alert("Could not block that user");
      return;
    }

    setBlockedUserIds((prev) => [...prev, blockedUserId]);
    setArticles((prev) =>
      prev.map((article) => ({
        ...article,
        comments: article.comments
          .filter((comment) => comment.user_id !== blockedUserId)
          .map((comment) => ({
            ...comment,
            replies: comment.replies.filter((reply) => reply.user_id !== blockedUserId),
          })),
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
      if (reactionType === "like" && existingReaction.reaction_type !== "like") {
        void createNotification({
          recipientUserId: targetComment.user_id,
          type: "comment_like",
          articleId,
          commentId,
        });
      }
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

    if (reactionType === "like") {
      void createNotification({
        recipientUserId: targetComment.user_id,
        type: "comment_like",
        articleId,
        commentId,
      });
    }
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

      return rankArticlesWithSourcePreferences(filtered, {
        preferredSources,
        showLessSources,
        likedSources,
        dislikedSources,
        mode: "my-feed",
      });
    }

    if (sortMode === "latest") {
      return rankArticlesWithSourcePreferences(copied, {
        mode: "latest",
      });
    }

    return rankArticlesWithSourcePreferences(copied, {
      mode: "trending",
    });
  }, [
    articles,
    categories,
    preferredSources,
    showLessSources,
    likedSources,
    dislikedSources,
    sortMode,
  ]);

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

  const openCategorySheet = useCallback(() => {
    setCategoryDraft(categories);
    setCategorySheetStatus(
      userId
        ? null
        : {
            type: "error",
            text: "Log in to customize categories.",
        }
    );
    setIsCategorySheetOpen(true);
  }, [categories, userId]);

  useEffect(() => {
    const handleOpenCategories = () => {
      openCategorySheet();
    };

    window.addEventListener("reflekt:open-categories", handleOpenCategories);

    return () => {
      window.removeEventListener("reflekt:open-categories", handleOpenCategories);
    };
  }, [openCategorySheet]);

  const handleToggleCategoryDraft = (category: string) => {
    setCategoryDraft((prev) =>
      prev.includes(category)
        ? prev.filter((current) => current !== category)
        : [...prev, category]
    );
  };

  const handleSaveCategories = async () => {
    if (!userId) {
      setCategorySheetStatus({
        type: "error",
        text: "Log in to customize categories.",
      });
      return;
    }

    setIsSavingCategories(true);
    setCategorySheetStatus(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: user?.email ?? null,
      },
      {
        id: userId,
        email: user?.email ?? null,
        username: username ?? null,
        categories: categoryDraft,
        preferred_sources: preferredSources,
        show_less_sources: showLessSources,
      }
    );

    setIsSavingCategories(false);

    if (error) {
      console.error("Error saving categories:", error);
      setCategorySheetStatus({
        type: "error",
        text: error.message ?? "Could not save categories right now.",
      });
      return;
    }

    setCategories(categoryDraft);
    setCategorySheetStatus({
      type: "success",
      text: "Categories updated.",
    });
    window.setTimeout(() => {
      setIsCategorySheetOpen(false);
      setCategorySheetStatus(null);
    }, 900);
  };

  const openSourcePreferenceSheet = (sourceName: string) => {
    setActiveSourceName(sourceName);
    setSourceRatingStatus(null);
  };

  const closeSourcePreferenceSheet = () => {
    if (isSavingSourceRating) {
      return;
    }

    setActiveSourceName(null);
    setSourceRatingStatus(null);
  };

  const handleSaveSourceRating = async (
    sourceName: string,
    rating: "like" | "dislike"
  ) => {
    if (!userId) {
      setSourceRatingStatus({
        type: "error",
        text: "Log in to rate sources.",
      });
      return;
    }

    const currentRating = likedSources.includes(sourceName)
      ? "like"
      : dislikedSources.includes(sourceName)
        ? "dislike"
        : null;
    const isFirstRating = currentRating === null;

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
      text: isFirstRating
        ? rating === "dislike"
          ? "We'll show you less from this source in My Feed."
          : "We'll keep showing this source in My Feed."
        : "Source rating updated.",
    });
  };

  return (
    <section className="page-shell">
      <div className="page-hero">
        <div className="page-title-row">
          <div className="trending-tabs-wrap">
            <div className="toolbar toolbar-centered">
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
        <LoadingScreen />
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
          {displayedArticles.map((article, index) => {
            console.log("SOURCE NAME:", article.source);

            return (
              <div key={article.id} className="stack">
                <article className="news-card">
                  <div className="trending-source-row">
                    <button
                      type="button"
                      className="source-trigger trending-source-button"
                      onClick={() => openSourcePreferenceSheet(article.source)}
                    >
                      <div className="trending-source-brand">
                        <SourceBadge sourceName={article.source} />
                        <span className="trending-source-name">{article.source}</span>
                      </div>
                    </button>
                    {sortMode === "trending" && index < 3 ? (
                      <span className="chip trending-rank-badge">Top {index + 1}</span>
                    ) : null}
                  </div>
                  <Link href={`/article/${article.id}`} className="article-link">
                    <div className="news-card-body">
                      <div className="trending-title-row">
                        <h3 className="trending-article-title">{article.title}</h3>
                      </div>

                      <div className="news-card-header">
                        <div className="trending-meta-row">
                          <span className="trending-published-date">
                            {sortMode === "latest"
                              ? formatFreshnessTime(article.publishedAt, article.time)
                              : formatPublishedDate(article.publishedAt, article.time)}
                          </span>
                          <span className="chip chip-accent trending-category-pill">
                            {getCategoryLabel(article.category)}
                          </span>
                        </div>
                      </div>

                      {getArticleCardImage(article) ? (
                        <img
                          src={getArticleCardImage(article) as string}
                          alt={article.title}
                          className="article-image"
                        />
                      ) : (
                        <div className="article-image article-image-placeholder" aria-hidden="true">
                          <span>Photo unavailable</span>
                        </div>
                      )}
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
                      <span className="icon-action-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path
                            d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                            fill={article.likedByCurrentUser ? "currentColor" : "none"}
                          />
                        </svg>
                      </span>
                      <span>{article.likes}</span>
                    </button>
                    <button
                      className="icon-action-pill"
                      onClick={() => {
                        router.push(`/article/${article.id}#comments`);
                      }}
                      aria-label="Open article comments"
                    >
                      <span className="icon-action-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                        </svg>
                      </span>
                      <span>{article.comments.length}</span>
                    </button>
                    <ShareButton
                      path={`/article/${article.id}`}
                      title={article.title}
                      url={article.url}
                      iconOnly
                    />
                    <button
                      className={`bookmark-button ${article.saved ? "bookmark-button-active" : ""}`}
                      onClick={() => handleToggleSaveArticle(article)}
                      disabled={activeSaveArticleId === article.id}
                      aria-label={article.saved ? "Remove bookmark" : "Save article"}
                    >
                      <span className="icon-action-glyph" aria-hidden="true">
                        {activeSaveArticleId === article.id ? (
                          <svg {...actionIconProps}>
                            <path d="M12 5v7" />
                            <path d="m8.5 8.5 3.5 3.5 3.5-3.5" />
                          </svg>
                        ) : (
                          <svg {...actionIconProps}>
                            <path
                              d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                              fill={article.saved ? "currentColor" : "none"}
                            />
                          </svg>
                        )}
                      </span>
                    </button>
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
                (index + 1) % 3 === 0 &&
                videos.length > 0 ? (
                <VideoFeedCard
                  video={videos[Math.floor((index + 1) / 3 - 1) % videos.length]}
                  onToggleLike={handleToggleVideoLike}
                  onToggleSave={handleToggleVideoSave}
                  onOpenComments={(videoId) => router.push(`/video/${videoId}#comments`)}
                  onOpenPlayer={(videoId) => router.push(`/video/${videoId}`)}
                  label="Video"
                  className="video-card-inline"
                  variant="article"
                />
              ) : null}
              </div>
            );
          })}
          {isLoadingMoreArticles ? (
            <div className="feed-inline-loading" role="status" aria-live="polite">
              Loading more stories...
            </div>
          ) : null}
          {!isLoading && hasMoreArticles ? (
            <div ref={loadMoreSentinelRef} className="feed-load-sentinel" aria-hidden="true" />
          ) : null}
        </div>
      )}

      <SourceRatingSheet
        sourceName={activeSourceName}
        isOpen={activeSourceName !== null}
        currentRating={
          activeSourceName
            ? likedSources.includes(activeSourceName)
              ? "like"
              : dislikedSources.includes(activeSourceName)
                ? "dislike"
                : null
            : null
        }
        isSaving={isSavingSourceRating}
        status={sourceRatingStatus}
        onLike={() => {
          if (activeSourceName) {
            void handleSaveSourceRating(activeSourceName, "like");
          }
        }}
        onDislike={() => {
          if (activeSourceName) {
            void handleSaveSourceRating(activeSourceName, "dislike");
          }
        }}
        onClose={closeSourcePreferenceSheet}
      />

      {isCategorySheetOpen ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-sheet-title"
        >
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="category-sheet-title" className="modal-title">
                  Customize feed
                </h3>
                <p className="muted bottom-sheet-title">
                  Choose categories to shape your Graffiti feed.
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => {
                  if (isSavingCategories) {
                    return;
                  }

                  setIsCategorySheetOpen(false);
                  setCategorySheetStatus(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="category-sheet-grid">
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  className={`category-pill ${
                    categoryDraft.includes(category) ? "category-pill-active" : ""
                  }`}
                  onClick={() => handleToggleCategoryDraft(category)}
                >
                  {getCategoryLabel(category)}
                </button>
              ))}
            </div>

            {categorySheetStatus ? (
              <div
                className={`status-message ${
                  categorySheetStatus.type === "success"
                    ? "status-success"
                    : "status-error"
                }`}
              >
                {categorySheetStatus.text}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setCategoryDraft(categories);
                  setCategorySheetStatus(null);
                }}
                disabled={isSavingCategories}
              >
                Reset
              </button>
              <button
                className="button button-accent"
                onClick={handleSaveCategories}
                disabled={isSavingCategories || !userId}
              >
                {isSavingCategories ? "Saving..." : "Save categories"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCommentsArticle ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comments"
          onClick={() => {
            setActiveCommentsArticleId(null);
            setReplyTarget(null);
            setIsCommentSortMenuOpen(false);
          }}
        >
          <div
            className="bottom-sheet comment-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />

            <div className="comment-sheet-topbar">
              <div className="comment-sort-menu">
                <button
                  className="comment-sort-trigger"
                  type="button"
                  onClick={() =>
                    setIsCommentSortMenuOpen((current) => !current)
                  }
                  aria-expanded={isCommentSortMenuOpen}
                  aria-haspopup="menu"
                >
                  <span>
                    {commentSortMode === "top"
                      ? "Top comments"
                      : commentSortMode === "controversial"
                        ? "Controversial"
                        : "Newest"}
                  </span>
                  <span className="comment-sort-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {isCommentSortMenuOpen ? (
                  <div className="comment-sort-dropdown" role="menu">
                    <button
                      className="comment-sort-option"
                      type="button"
                      onClick={() => {
                        setCommentSortMode("controversial");
                        setIsCommentSortMenuOpen(false);
                      }}
                    >
                      Controversial
                    </button>
                    <button
                      className="comment-sort-option"
                      type="button"
                      onClick={() => {
                        setCommentSortMode("newest");
                        setIsCommentSortMenuOpen(false);
                      }}
                    >
                      Newest
                    </button>
                  </div>
                ) : null}
              </div>
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
                      {comment.replies.length > 0 ? (
                        <div className="comment-replies">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="comment-reply-card">
                              <div className="comment-header">
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
                                  <strong>{reply.username ?? "Unknown"}</strong>
                                )}
                              </div>
                              <div className="comment-body">{reply.text}</div>
                              <div className="comment-meta">
                                {formatRelativeTime(reply.created_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                          onClick={() => {
                            setReplyTarget({
                              articleId: activeCommentsArticle.id,
                              commentId: comment.id,
                              username: comment.username,
                            });
                          }}
                          type="button"
                        >
                          Reply
                        </button>
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

            <div className="comment-sheet-composer">
              {replyTarget && replyTarget.articleId === activeCommentsArticle.id ? (
                <div className="comment-reply-banner">
                  <span>
                    Replying to <strong>{replyTarget.username ?? "this comment"}</strong>
                  </span>
                  <button
                    className="comment-action"
                    onClick={() => setReplyTarget(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <div className="input-row bottom-sheet-input-row">
                <input
                  ref={commentInputRef}
                  className="input"
                  type="text"
                  placeholder={
                    replyTarget && replyTarget.articleId === activeCommentsArticle.id
                      ? "Write a reply..."
                      : "Write a comment..."
                  }
                  value={commentInputs[activeCommentsArticle.id] || ""}
                  onChange={(e) =>
                    handleCommentInputChange(activeCommentsArticle.id, e.target.value)
                  }
                />
                <button
                  className="button button-secondary"
                  onClick={() => handleAddComment(activeCommentsArticle.id)}
                >
                  {replyTarget && replyTarget.articleId === activeCommentsArticle.id
                    ? "Reply"
                    : "Send"}
                </button>
              </div>
              {commentComposerStatus ? (
                <div
                  className={`status-message ${
                    commentComposerStatus.type === "success"
                      ? "status-success"
                      : "status-error"
                  }`}
                >
                  {commentComposerStatus.text}
                </div>
              ) : null}
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
