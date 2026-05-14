"use client";

import AdSlot from "./components/ad-slot";
import LoadingScreen from "./components/loading-screen";
import PollCard from "./components/poll-card";
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
import { apiFetch, buildApiUrl } from "../lib/api-base";
import {
  getBestArticleImage,
  isLikelyHighQualityArticleImage,
} from "../lib/article-images";
import { cleanDisplayText } from "../lib/display-text";
import {
  applyPollVoteUpdate,
  hydratePolls,
  type PollRecord,
  type PollWithResults,
} from "../lib/polls";
import { ensureProfileRow, saveProfilePatch } from "../lib/profile-store";
import { isCommentAllowed } from "../lib/moderation";
import { slugifySourceName } from "../lib/source-logos";
import { supabase } from "../lib/supabase";
import { rankArticlesWithSourcePreferences } from "../lib/feed-ranking";
import { CATEGORY_OPTIONS, getCategoryLabel, getDisplayCategory } from "../lib/categories";
import { normalizeVideoFeedItems, type VideoApiItem, type VideoItem } from "../lib/video-feed";

const FEED_PAGE_SIZE = 25;
const INITIAL_FEED_WARNING_MS = 4200;
const INITIAL_FEED_TIMEOUT_MS = 5000;

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
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
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
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type TrendingFeedItem =
  | { type: "article"; key: string; article: Article }
  | { type: "video"; key: string; video: VideoItem };

const LOCAL_CITY_SUGGESTIONS = [
  "Chicago, IL",
  "Los Angeles, CA",
  "New York, NY",
  "Atlanta, GA",
  "Houston, TX",
  "Miami, FL",
  "Charlotte, NC",
  "Cincinnati, OH",
  "Detroit, MI",
  "Minneapolis, MN",
  "Phoenix, AZ",
  "San Francisco, CA",
  "Philadelphia, PA",
] as const;

const LOCAL_CITY_CONFIGS = {
  "Chicago, IL": {
    query:
      "Chicago local news Chicago Tribune WGN Chicago ABC7 Chicago NBC Chicago CBS Chicago Fox 32 Chicago Block Club Chicago WBEZ Chicago",
    sources: [
      "Chicago Tribune",
      "WGN Chicago",
      "WGN-TV",
      "ABC7 Chicago",
      "NBC Chicago",
      "CBS Chicago",
      "Fox 32 Chicago",
      "Block Club Chicago",
      "WBEZ Chicago",
    ],
    signals: ["chicago", "illinois", "cook county", "evanston", "oak park"],
  },
  "Los Angeles, CA": {
    query:
      "Los Angeles local news LA Times KTLA ABC7 Los Angeles NBC Los Angeles CBS Los Angeles LAist",
    sources: ["LA Times", "KTLA", "ABC7 Los Angeles", "NBC Los Angeles", "CBS Los Angeles", "LAist"],
    signals: ["los angeles", "la county", "hollywood", "pasadena", "santa monica"],
  },
  "New York, NY": {
    query:
      "New York local news NY1 Gothamist New York Daily News CBS New York NBC New York ABC7NY",
    sources: ["NY1", "Gothamist", "New York Daily News", "CBS New York", "NBC New York", "ABC7NY"],
    signals: ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island"],
  },
  "Atlanta, GA": {
    query: "Atlanta local news AJC WSB-TV FOX 5 Atlanta 11Alive Atlanta News First",
    sources: ["AJC", "WSB-TV", "FOX 5 Atlanta", "11Alive", "Atlanta News First"],
    signals: ["atlanta", "georgia", "fulton county", "buckhead", "decatur"],
  },
  "Houston, TX": {
    query: "Houston local news Houston Chronicle KHOU ABC13 Houston FOX 26 Houston KPRC",
    sources: ["Houston Chronicle", "KHOU", "ABC13 Houston", "FOX 26 Houston", "KPRC"],
    signals: ["houston", "texas", "harris county", "katy", "sugar land"],
  },
  "Miami, FL": {
    query: "Miami local news Miami Herald WSVN NBC 6 South Florida CBS Miami Local 10",
    sources: ["Miami Herald", "WSVN", "NBC 6 South Florida", "CBS Miami", "Local 10"],
    signals: ["miami", "south florida", "dade", "miami-dade", "fort lauderdale"],
  },
  "Charlotte, NC": {
    query:
      "Charlotte NC local news Charlotte Observer WSOC Charlotte WBTV Charlotte WCNC Charlotte Queen City News WFAE Charlotte Axios Charlotte",
    sources: [
      "Charlotte Observer",
      "WSOC-TV",
      "WSOC Charlotte",
      "WBTV",
      "WCNC",
      "Queen City News",
      "WFAE",
      "Axios Charlotte",
    ],
    signals: ["charlotte", "mecklenburg", "queen city", "gastonia", "rock hill", "fort mill"],
  },
  "Cincinnati, OH": {
    query: "Cincinnati local news Cincinnati Enquirer WCPO WLWT FOX19",
    sources: ["Cincinnati Enquirer", "WCPO", "WLWT", "FOX19"],
    signals: ["cincinnati", "ohio", "hamilton county", "covington", "newport"],
  },
  "Detroit, MI": {
    query: "Detroit local news Detroit Free Press Detroit News WXYZ ClickOnDetroit FOX 2 Detroit",
    sources: ["Detroit Free Press", "Detroit News", "WXYZ", "ClickOnDetroit", "FOX 2 Detroit"],
    signals: ["detroit", "michigan", "wayne county", "dearborn", "troy"],
  },
  "Minneapolis, MN": {
    query: "Minneapolis local news Star Tribune KARE 11 WCCO FOX 9 MPR News",
    sources: ["Star Tribune", "KARE 11", "WCCO", "FOX 9", "MPR News"],
    signals: ["minneapolis", "saint paul", "st paul", "minnesota", "hennepin"],
  },
  "Phoenix, AZ": {
    query: "Phoenix local news Arizona Republic AZFamily ABC15 Arizona FOX 10 Phoenix 12News",
    sources: ["Arizona Republic", "AZFamily", "ABC15 Arizona", "FOX 10 Phoenix", "12News"],
    signals: ["phoenix", "arizona", "maricopa county", "mesa", "scottsdale"],
  },
  "San Francisco, CA": {
    query: "San Francisco local news SF Chronicle KQED ABC7 Bay Area NBC Bay Area CBS News Bay Area",
    sources: ["SF Chronicle", "KQED", "ABC7 Bay Area", "NBC Bay Area", "CBS News Bay Area"],
    signals: ["san francisco", "bay area", "oakland", "san jose", "berkeley"],
  },
  "Philadelphia, PA": {
    query: "Philadelphia local news Philadelphia Inquirer 6ABC NBC10 Philadelphia CBS Philadelphia WHYY",
    sources: ["Philadelphia Inquirer", "6ABC", "NBC10 Philadelphia", "CBS Philadelphia", "WHYY"],
    signals: ["philadelphia", "pennsylvania", "philly", "camden", "delaware county"],
  },
} as const;

const NATIONAL_SOURCE_KEYWORDS = [
  "fox news",
  "cnn",
  "msnbc",
  "reuters",
  "associated press",
  "ap news",
  "nbc news",
  "cbs news",
  "abc news",
  "newsmax",
];

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function normalizeLookupValue(value: string | null | undefined) {
  return cleanDisplayText(value ?? "")
    .trim()
    .toLowerCase();
}

function getSupportedLocalCityConfig(
  city?: string | null,
  state?: string | null,
  label?: string | null
) {
  const combined = normalizeLookupValue([city, state, label].filter(Boolean).join(" "));

  return (
    Object.entries(LOCAL_CITY_CONFIGS).find(([cityLabel, config]) => {
      const normalizedCityLabel = normalizeLookupValue(cityLabel);
      return (
        combined.includes(normalizedCityLabel) ||
        config.signals.some((signal) => combined.includes(normalizeLookupValue(signal)))
      );
    }) ?? null
  );
}

function buildLocalNewsQuery(options?: {
  city?: string | null;
  state?: string | null;
  label?: string | null;
}) {
  const label = cleanDisplayText(options?.label ?? "").trim();
  const city = cleanDisplayText(options?.city ?? "").trim();
  const state = cleanDisplayText(options?.state ?? "").trim();

  const localCityMatch = getSupportedLocalCityConfig(city, state, label);

  if (localCityMatch) {
    return localCityMatch[1].query;
  }

  const fallbackLabel = label || [city, state].filter(Boolean).join(", ");
  return fallbackLabel ? `${fallbackLabel} local news` : "United States local news";
}

function getLocalSearchTerms(localQuery: string, localLocationLabel: string) {
  const combined = normalizeLookupValue(`${localLocationLabel} ${localQuery}`);
  const terms = combined
    .split(/[^a-z0-9]+/i)
    .filter(
      (term) =>
        term.length >= 3 &&
        !["local", "news", "north", "south", "carolina", "united", "states", "regional"].includes(
          term
        )
    );

  return Array.from(new Set(terms));
}

function scoreLocalArticle(article: Article, localQuery: string, localLocationLabel: string) {
  const sourceName = normalizeLookupValue(article.source);
  const title = normalizeLookupValue(article.title);
  const description = normalizeLookupValue(article.description);
  const articleText = `${title} ${description} ${normalizeLookupValue(article.url)}`;
  const localTerms = getLocalSearchTerms(localQuery, localLocationLabel);
  const matchedLocalCity = getSupportedLocalCityConfig(undefined, undefined, `${localLocationLabel} ${localQuery}`);
  const articleAgeHours = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60))
    : 48;
  let score = Math.max(0, 120 - articleAgeHours);

  const localTermMatches = localTerms.filter((term) => articleText.includes(term)).length;
  score += localTermMatches * 18;

  if (matchedLocalCity) {
    const localConfig = matchedLocalCity[1];
    const hasLocalSource = localConfig.sources.some((source) =>
      sourceName.includes(normalizeLookupValue(source))
    );
    const hasLocalStorySignal = localConfig.signals.some((signal) =>
      articleText.includes(normalizeLookupValue(signal))
    );

    if (hasLocalSource) {
      score += 220;
    }

    if (hasLocalStorySignal) {
      score += 95;
    }

    if (
      !hasLocalSource &&
      !hasLocalStorySignal &&
      NATIONAL_SOURCE_KEYWORDS.some((keyword) => sourceName.includes(keyword))
    ) {
      score -= 95;
    }
  } else {
    const hasLocationInSource = localTerms.some((term) => sourceName.includes(term));
    if (hasLocationInSource) {
      score += 48;
    }
  }

  if (
    !localTermMatches &&
    NATIONAL_SOURCE_KEYWORDS.some((keyword) => sourceName.includes(keyword))
  ) {
    score -= 30;
  }

  return score;
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

function isFallbackFeedArticle(article: FeedArticlePayload) {
  return article.url?.includes("graffiti.app/fallback") ?? false;
}

function arraysShallowEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getPublishedAtTimestamp(publishedAt: string | null | undefined) {
  if (!publishedAt) {
    return 0;
  }

  const timestamp = new Date(publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getSafeSourceLabel(value: unknown) {
  if (typeof value !== "string") {
    return "Unknown source";
  }

  const cleaned = cleanDisplayText(value).replace(/\s+\d+(?:\.\d+)?$/, "").trim();

  if (
    !cleaned ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
  ) {
    return "News source";
  }

  return cleaned;
}

function getSafeCategoryLabel(value: unknown, article?: Pick<Article, "source" | "title">) {
  return getDisplayCategory(typeof value === "string" ? value : null, {
    source: article?.source ?? null,
    title: article?.title ?? null,
  });
}

export default function Home() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<"trending" | "my-feed" | "latest" | "local">(
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
  const [isInitialFeedLoading, setIsInitialFeedLoading] = useState(true);
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
  const [myFeedPolls, setMyFeedPolls] = useState<PollWithResults[]>([]);
  const [activePollVoteId, setActivePollVoteId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [autoplayTrendingVideoId, setAutoplayTrendingVideoId] = useState<string | null>(null);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [categorySheetStatus, setCategorySheetStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [failedArticleImages, setFailedArticleImages] = useState<Record<string, true>>({});
  const [feedPage, setFeedPage] = useState(1);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [localQueryDraft, setLocalQueryDraft] = useState("");
  const [localLocationLabel, setLocalLocationLabel] = useState("Regional news");
  const [isLocalAutocompleteOpen, setIsLocalAutocompleteOpen] = useState(false);
  const [localSearchStatus, setLocalSearchStatus] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const trendingVideoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isFetchingNextPageRef = useRef(false);
  const activeFeedRequestIdRef = useRef(0);
  const categoriesRef = useRef<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<{
    articleId: number;
    commentId: number;
    username: string | null;
  } | null>(null);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    console.log("APP RENDERED");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("FOUND LOADING ARTICLES COMPONENT");
      console.log("CURRENT ROUTE", window.location.pathname);
    }
    console.log("TRENDING LOADING STATE", isLoading);
    console.log("ARTICLES COUNT", articles.length);
    console.log("LOADING STATE", isLoading);
  }, [articles.length, isLoading]);

  const feedMode: "trending" | "latest" | "myfeed" | "local" = useMemo(() => {
    if (sortMode === "latest") {
      return "latest";
    }

    if (sortMode === "my-feed") {
      return "myfeed";
    }

    if (sortMode === "local") {
      return "local";
    }

    return "trending";
  }, [sortMode]);

  const categoryReloadKey =
    sortMode === "my-feed" ? categories.join("|") : "__ignore-categories__";
  const isMyFeedWithoutCategories =
    sortMode === "my-feed" && categories.length === 0;

  const loadFeedPage = useCallback(async (pageToLoad: number, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;
    const requestCategories = categoriesRef.current;
    const requestId = activeFeedRequestIdRef.current + 1;
    activeFeedRequestIdRef.current = requestId;

    const isCurrentRequest = () => activeFeedRequestIdRef.current === requestId;
    let hasLiveNewsResponse = false;
    let initialLoadTimeoutId: number | null = null;
    let initialLoadWarningTimeoutId: number | null = null;
    let articleFetchTimeoutId: number | null = null;

    if (!replace && isFetchingNextPageRef.current) {
      return;
    }

    if (replace) {
      setIsLoading(true);
      setFeedLoadError(null);
      setIsInitialFeedLoading(feedMode === "trending" && pageToLoad === 1);
      if (typeof window !== "undefined") {
        initialLoadWarningTimeoutId = window.setTimeout(() => {
          if (!isCurrentRequest()) {
            return;
          }
        }, INITIAL_FEED_WARNING_MS);

        initialLoadTimeoutId = window.setTimeout(() => {
          if (!isCurrentRequest()) {
            return;
          }

          activeFeedRequestIdRef.current += 1;
          console.error("INITIAL APP LOAD FAILED", {
            reason: "timeout",
            feedMode,
            pageToLoad,
            timeoutMs: INITIAL_FEED_TIMEOUT_MS,
          });
          setFeedLoadError("Couldn’t load stories. Tap to retry.");
          setArticles([]);
          setHasMoreArticles(false);
          setFeedPage(1);
          setIsInitialFeedLoading(false);
          isFetchingNextPageRef.current = false;
          setIsLoading(false);
          setIsLoadingMoreArticles(false);
        }, INITIAL_FEED_TIMEOUT_MS);
      }
    } else {
      isFetchingNextPageRef.current = true;
      if (!replace) {
        setIsLoadingMoreArticles(true);
      }
    }

    try {
      let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"] = {
        user: null,
      };

      try {
        const authResponse = await supabase.auth.getUser();
        userData = authResponse.data;
      } catch (error) {
        console.error("INITIAL APP LOAD FAILED", error);
        userData = { user: null };
      }

      if (!isCurrentRequest()) {
        return;
      }

      setUserId(userData.user?.id ?? null);

      if (userData.user?.id) {
        let profile:
          | Awaited<ReturnType<typeof ensureProfileRow>>["data"]
          | null
          | undefined = null;
        let profileError: Awaited<ReturnType<typeof ensureProfileRow>>["error"] | null =
          null;

        try {
          const profileResponse = await ensureProfileRow({
            id: userData.user.id,
            email: userData.user.email ?? null,
          });
          profile = profileResponse.data;
          profileError = profileResponse.error;
        } catch (error) {
          console.error("INITIAL APP LOAD FAILED", error);
          profile = null;
          profileError = null;
        }

        if (profileError) {
          console.error("Error loading home profile:", profileError);
        }

        if (!isCurrentRequest()) {
          return;
        }

        setUsername(profile?.username ?? null);
        const nextCategories = profile?.categories ?? [];
        setCategories((prev) =>
          arraysShallowEqual(prev, nextCategories) ? prev : nextCategories
        );
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

      let newsPath = "";

      if (feedMode === "local") {
        const localSearchQuery = localQuery.trim() || "United States local news";
        const params = new URLSearchParams({
          mode: "local",
          location: localSearchQuery,
          page: String(pageToLoad),
          pageSize: String(FEED_PAGE_SIZE),
        });
        newsPath = `/api/news?${params.toString()}`;
      } else {
        const params = new URLSearchParams({
          mode: feedMode,
          page: String(pageToLoad),
          pageSize: String(FEED_PAGE_SIZE),
        });

        if (feedMode === "myfeed" && requestCategories.length > 0) {
          params.set("category", requestCategories.join(","));
        }

        newsPath = `/api/news?${params.toString()}`;
      }
      const newsUrl = buildApiUrl(newsPath);
      console.log("TRENDING FETCH URL", newsUrl);

      const articleFetchController =
        replace && typeof AbortController !== "undefined" ? new AbortController() : null;

      if (replace && typeof window !== "undefined" && articleFetchController) {
        articleFetchTimeoutId = window.setTimeout(() => {
          articleFetchController.abort();
        }, INITIAL_FEED_TIMEOUT_MS);
      }

      const newsRes = await apiFetch(newsPath, {
        signal: articleFetchController?.signal,
      });

      if (!isCurrentRequest()) {
        return;
      }

      if (!newsRes.ok) {
        throw new Error(`Home feed request failed with status ${newsRes.status}`);
      }

      const newsPayload = normalizeNewsPayload(
        (await newsRes.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );
      console.log("NEWS API DATA", newsPayload);
      console.log("TRENDING FETCH RESPONSE", newsPayload);

      if (!isCurrentRequest()) {
        return;
      }

      const newsData = newsPayload.articles;
      hasLiveNewsResponse = true;
      console.log("NEWS API ARTICLE COUNT", newsData.length);
      console.log("FIRST ARTICLE IMAGE FIELDS", {
        title: newsData[0]?.title,
        image: newsData[0]?.image,
        imageUrl: newsData[0]?.imageUrl,
        urlToImage: newsData[0]?.urlToImage,
      });

      const receivedFallbackFeed =
        newsData.length > 0 && newsData.every((article) => isFallbackFeedArticle(article));

      if (replace && newsData.length === 0) {
        const emptyResponseError = new Error("Trending returned zero articles.");
        console.log("TRENDING FETCH ERROR", emptyResponseError);
        setFeedLoadError("Couldn’t load stories. Tap to retry.");
        setArticles([]);
        setHasMoreArticles(false);
        setFeedPage(1);
        setIsInitialFeedLoading(false);
        return;
      }

      const [
        likesResult,
        commentsResult,
        commentReactionsResult,
        commentRepliesResult,
        profilesResult,
        savedArticlesResult,
        blockedUsersResult,
        ownBlockedUsersResult,
        sourceRatingsResult,
      ] = await Promise.allSettled([
        supabase.from("likes").select("id, article_id, user_id"),
        supabase
          .from("comments")
          .select("id, article_id, text, username, user_id, created_at"),
        supabase
          .from("comment_reactions")
          .select("id, comment_id, user_id, reaction_type"),
        supabase
          .from("comment_replies")
          .select("id, comment_id, article_id, text, username, user_id, created_at"),
        supabase.from("profiles").select("id, avatar_url, username"),
        userData.user?.id
          ? supabase
              .from("saved_articles")
              .select("article_id")
              .eq("user_id", userData.user.id)
          : Promise.resolve({ data: [] as DbSavedArticle[], error: null }),
        userData.user?.id
          ? listMutuallyHiddenUserIds(supabase, userData.user.id)
          : Promise.resolve({ data: [] as string[], error: null }),
        userData.user?.id
          ? listBlockedUsers(supabase, userData.user.id)
          : Promise.resolve({ data: [] as DbBlockedUser[], error: null }),
        userData.user?.id
          ? supabase
              .from("source_ratings")
              .select("id, user_id, source_name, rating")
              .eq("user_id", userData.user.id)
          : Promise.resolve({ data: [] as DbSourceRating[], error: null }),
      ]);

      if (!isCurrentRequest()) {
        return;
      }

      const readSettledData = <T,>(
        label: string,
        result: PromiseSettledResult<{ data: T; error: { message?: string } | null }>
      ): T => {
        if (result.status === "rejected") {
          console.error(`Error loading ${label}:`, result.reason);
          return ([] as unknown) as T;
        }

        if (result.value.error) {
          console.error(`Error loading ${label}:`, result.value.error);
        }

        return result.value.data;
      };

      const likes = (readSettledData("likes", likesResult) ?? []) as DbLike[];
      const comments = (readSettledData("comments", commentsResult) ?? []) as DbComment[];
      const commentReactions = (readSettledData(
        "comment reactions",
        commentReactionsResult
      ) ?? []) as DbCommentReaction[];
      const commentReplies = (readSettledData(
        "comment replies",
        commentRepliesResult
      ) ?? []) as DbCommentReply[];
      const profiles = (readSettledData("profiles", profilesResult) ?? []) as DbProfile[];
      const sourceRatings = (readSettledData(
        "source ratings",
        sourceRatingsResult
      ) ?? []) as DbSourceRating[];
      const blockedUsersData = (readSettledData(
        "blocked users",
        blockedUsersResult
      ) ?? []) as string[];
      const ownBlockedUsersData = (readSettledData(
        "own blocked users",
        ownBlockedUsersResult
      ) ?? []) as DbBlockedUser[];
      const savedArticlesData = (readSettledData(
        "saved articles",
        savedArticlesResult
      ) ?? []) as DbSavedArticle[];
      const blockedIds = new Set(blockedUsersData);
      const savedArticleIds = new Set(
        savedArticlesData.map((savedArticle) => savedArticle.article_id)
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
        ownBlockedUsersData.map((blockedUser) => blockedUser.blocked_id)
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
      setFeedLoadError(replace && receivedFallbackFeed ? "Couldn’t load stories. Tap to retry." : null);
      setHasMoreArticles(receivedFallbackFeed ? false : newsPayload.hasMore);
      setFeedPage(pageToLoad);
      setArticles((prev) => {
        const nextArticles = receivedFallbackFeed && replace
          ? []
          :
          replace ? mergedArticles : mergeArticlesByIdentity(prev, mergedArticles);
        console.log("ARTICLES USED", nextArticles);
        console.log("TRENDING FINAL COUNT", nextArticles.length);
        return nextArticles;
      });
      if (replace) {
        setIsInitialFeedLoading(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      console.log("TRENDING FETCH ERROR", error);
      console.error("INITIAL APP LOAD FAILED", error);
      if (replace && !hasLiveNewsResponse) {
        setFeedLoadError("Couldn’t load stories. Tap to retry.");
        setArticles([]);
        setHasMoreArticles(false);
        setFeedPage(1);
        setIsInitialFeedLoading(false);
      } else {
        console.error("Home feed enrichment failed after live stories loaded", error);
      }
    } finally {
      if (initialLoadWarningTimeoutId) {
        window.clearTimeout(initialLoadWarningTimeoutId);
      }

      if (initialLoadTimeoutId) {
        window.clearTimeout(initialLoadTimeoutId);
      }

      if (articleFetchTimeoutId) {
        window.clearTimeout(articleFetchTimeoutId);
      }

      if (!isCurrentRequest()) {
        return;
      }

      isFetchingNextPageRef.current = false;
      console.log("SETTING LOADING FALSE");
      setIsLoading(false);
      setIsLoadingMoreArticles(false);
    }
  }, [feedMode, localQuery]);

  const handleRetryFeedLoad = useCallback(() => {
    void loadFeedPage(1, { replace: true });
  }, [loadFeedPage]);

  useEffect(() => {
    if (isMyFeedWithoutCategories) {
      const timeoutId = window.setTimeout(() => {
        setArticles([]);
        setFeedPage(1);
        setHasMoreArticles(false);
        setFeedLoadError(null);
        setIsLoading(false);
        setIsInitialFeedLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      void loadFeedPage(1, { replace: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [categoryReloadKey, isMyFeedWithoutCategories, loadFeedPage, sortMode]);

  useEffect(() => {
    async function loadPolls() {
      if (!userId) {
        setMyFeedPolls([]);
        return;
      }

      const { data: followRowsData, error: followRowsError } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", userId);

      if (followRowsError) {
        console.error("Error loading follows for My Feed polls:", followRowsError);
        setMyFeedPolls([]);
        return;
      }

      const pollUserIds = Array.from(
        new Set([
          userId,
          ...(((followRowsData ?? []) as { following_id: string }[]).map(
            (followRow) => followRow.following_id
          )),
        ])
      );

      const { data: myFeedPollRows, error: myFeedPollsError } = pollUserIds.length
        ? await supabase
            .from("polls")
            .select(
              "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
            )
            .eq("status", "active")
            .in("user_id", pollUserIds)
            .order("created_at", { ascending: false })
            .limit(30)
        : { data: [], error: null };

      if (myFeedPollsError) {
        console.error("Error loading My Feed polls:", myFeedPollsError);
        setMyFeedPolls([]);
        return;
      }

      const hydratedMyFeedPolls = await hydratePolls(
        supabase,
        ((myFeedPollRows ?? []) as PollRecord[]),
        userId
      );
      setMyFeedPolls(
        [...hydratedMyFeedPolls].sort(
          (left, right) =>
            getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at)
        )
      );
    }

    void loadPolls();
  }, [userId]);

  useEffect(() => {
    async function loadTrendingVideos() {
      try {
        const response = await apiFetch("/api/videos");
        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(`Trending videos request failed (${response.status}): ${responseText}`);
        }

        const data = (await response.json()) as {
          videos?: VideoApiItem[];
          fallback?: boolean;
          message?: string;
        };

        if (data.fallback) {
          console.error("Trending videos fallback used", {
            message: data.message ?? "Unknown reason",
          });
        }

        const normalizedVideos = normalizeVideoFeedItems(data.videos).filter(
          (video) => !video.fallback
        );
        setVideos(normalizedVideos);
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos([]);
      }
    }

    void loadTrendingVideos();
  }, []);

  const handleVoteOnPoll = async (pollId: string, optionId: string) => {
    if (!userId) {
      alert("Log in to vote in polls.");
      return;
    }

    const currentPoll = myFeedPolls.find((poll) => poll.id === pollId) ?? null;

    if (!currentPoll || currentPoll.userVoteOptionId) {
      return;
    }

    setActivePollVoteId(pollId);

    const { error } = await supabase.from("poll_votes").insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: userId,
    });

    setActivePollVoteId(null);

    if (error) {
      console.error("Error saving poll vote:", error);
      alert(error.message ?? "Could not save your vote.");
      return;
    }

    setMyFeedPolls((prev) => applyPollVoteUpdate(prev, pollId, optionId));
  };

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

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    const playableVideos = videos.filter((video) => !video.fallback && Boolean(video.youtubeId));

    if (playableVideos.length === 0) {
      return;
    }

    const visibilityMap = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoId = (entry.target as HTMLDivElement).dataset.videoId;

          if (!videoId) {
            return;
          }

          visibilityMap.set(videoId, entry.isIntersecting ? entry.intersectionRatio : 0);
        });

        let nextAutoplayId: string | null = null;
        let highestRatio = 0;

        visibilityMap.forEach((ratio, videoId) => {
          if (ratio > highestRatio) {
            highestRatio = ratio;
            nextAutoplayId = videoId;
          }
        });

        setAutoplayTrendingVideoId(highestRatio >= 0.65 ? nextAutoplayId : null);
      },
      {
        threshold: [0.35, 0.5, 0.65, 0.8],
        rootMargin: "0px 0px -10% 0px",
      }
    );

    playableVideos.forEach((video) => {
      const node = trendingVideoFrameRefs.current[video.id];

      if (node) {
        visibilityMap.set(video.id, 0);
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [sortMode, videos]);

  useEffect(() => {
    if (sortMode !== "local" || localQuery) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const fallbackTimeoutId = window.setTimeout(() => {
        setLocalLocationLabel("Regional news");
        setLocalQuery("United States local news");
        setLocalQueryDraft("United States local news");
      }, 0);

      return () => {
        window.clearTimeout(fallbackTimeoutId);
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
            {
              headers: {
                Accept: "application/json",
              },
            }
          );
          const payload = (await response.json().catch(() => null)) as
            | {
                address?: {
                  city?: string;
                  town?: string;
                  village?: string;
                  state?: string;
                };
              }
            | null;
          const city =
            payload?.address?.city ??
            payload?.address?.town ??
            payload?.address?.village ??
            "";
          const state = payload?.address?.state ?? "";
          const nextLabel = [city, state].filter(Boolean).join(", ");
          const nextQuery = buildLocalNewsQuery({
            city,
            state,
            label: nextLabel,
          });
          setLocalLocationLabel(nextLabel || "Regional news");
          setLocalQuery(nextQuery);
          setLocalQueryDraft(nextLabel || "United States local news");
        } catch (error) {
          console.error("Error resolving local location:", error);
          setLocalLocationLabel("Regional news");
          setLocalQuery("United States local news");
          setLocalQueryDraft("United States local news");
        }
      },
      () => {
        setLocalLocationLabel("Regional news");
        setLocalQuery("United States local news");
        setLocalQueryDraft("United States local news");
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000,
      }
    );
  }, [localQuery, sortMode]);

  const handleUpdateLocalQuery = useCallback(async () => {
    const trimmedDraft = localQueryDraft.trim();
    const resolveSupportedCity = (value: string) => {
      const normalizedValue = cleanDisplayText(value).trim().toLowerCase();

      return (
        LOCAL_CITY_SUGGESTIONS.find(
          (city) => city.trim().toLowerCase() === normalizedValue
        ) ?? null
      );
    };

    if (!trimmedDraft) {
      setLocalLocationLabel("Regional news");
      setLocalQuery("United States local news");
      setLocalQueryDraft("United States local news");
      setLocalSearchStatus(null);
      return;
    }

    if (/^\d{5}$/.test(trimmedDraft)) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(
            trimmedDraft
          )}&limit=1&addressdetails=1`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );
        const payload = (await response.json().catch(() => [])) as Array<{
          address?: {
            city?: string;
            town?: string;
            village?: string;
            state?: string;
          };
        }>;
        const firstMatch = payload[0];
        const city =
          firstMatch?.address?.city ??
          firstMatch?.address?.town ??
          firstMatch?.address?.village ??
          "";
        const state = firstMatch?.address?.state ?? "";
        const nextLabel = [city, state].filter(Boolean).join(", ");

        if (nextLabel) {
          const supportedCity = resolveSupportedCity(nextLabel);

          if (supportedCity) {
            setLocalLocationLabel(supportedCity);
            setLocalQuery(buildLocalNewsQuery({ city, state, label: supportedCity }));
            setLocalQueryDraft(supportedCity);
            setLocalSearchStatus(null);
            return;
          }

          setLocalSearchStatus(
            "Choose a supported nearby metro area from the dropdown for stronger local coverage."
          );
          return;
        }
      } catch (error) {
        console.error("Error resolving local zip code:", error);
      }
    }

    const supportedCity = resolveSupportedCity(trimmedDraft);

    if (!supportedCity) {
      setLocalSearchStatus(
        "Choose a supported nearby metro area from the dropdown for stronger local coverage."
      );
      return;
    }

    setLocalLocationLabel(supportedCity);
    setLocalQuery(buildLocalNewsQuery({ label: supportedCity }));
    setLocalQueryDraft(supportedCity);
    setLocalSearchStatus(null);
  }, [localQueryDraft]);

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
        title: cleanDisplayText(article.title),
        source: article.source,
        category: article.category,
        time: article.time,
        url: article.url ?? null,
        image: getBestArticleImage(article).src,
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
      article_title: cleanDisplayText(targetArticle?.title ?? null) || null,
      article_source: targetArticle?.source ?? null,
      article_image: targetArticle ? getBestArticleImage(targetArticle).src : null,
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

    return copied;
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

  const balancedLocalArticles = useMemo(() => {
    if (sortMode !== "local") {
      return displayedArticles;
    }

    const locallyRelevantArticles = [...displayedArticles].filter((article) => {
      if (!localQuery.trim()) {
        return true;
      }

      return scoreLocalArticle(article, localQuery, localLocationLabel) >= 110;
    });

    return locallyRelevantArticles.sort((leftArticle, rightArticle) => {
      const scoreDifference =
        scoreLocalArticle(rightArticle, localQuery, localLocationLabel) -
        scoreLocalArticle(leftArticle, localQuery, localLocationLabel);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const rightPublishedAt = rightArticle.publishedAt
        ? new Date(rightArticle.publishedAt).getTime()
        : 0;
      const leftPublishedAt = leftArticle.publishedAt
        ? new Date(leftArticle.publishedAt).getTime()
        : 0;

      return rightPublishedAt - leftPublishedAt;
    });
  }, [displayedArticles, localLocationLabel, localQuery, sortMode]);

  const visibleArticles = sortMode === "local" ? balancedLocalArticles : displayedArticles;
  const localCitySuggestions = useMemo(() => {
    if (sortMode !== "local") {
      return [] as string[];
    }

    const normalizedDraft = cleanDisplayText(localQueryDraft).trim().toLowerCase();

    if (normalizedDraft.length === 0) {
      return [];
    }

    const startsWithMatches = LOCAL_CITY_SUGGESTIONS.filter((city) =>
      city.toLowerCase().startsWith(normalizedDraft)
    );

    return startsWithMatches.slice(0, 8);
  }, [localQueryDraft, sortMode]);

  const balancedTrendingArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return visibleArticles;
    }

    const prioritizedArticles = [...visibleArticles];
    const diversifiedTopArticles: Article[] = [];
    const selectedSourceUsage = new Map<string, number>();
    let lastSourceKey = "";
    let lastCategoryKey = "";

    while (diversifiedTopArticles.length < 25 && prioritizedArticles.length > 0) {
      let selectedIndex = -1;

      for (let index = 0; index < prioritizedArticles.length; index += 1) {
        const article = prioritizedArticles[index];
        const sourceKey = getSafeSourceLabel(article.source).trim().toLowerCase();
        const categoryKey = getSafeCategoryLabel(article.category, article).trim().toLowerCase();
        const sourceUseCount = selectedSourceUsage.get(sourceKey) ?? 0;

        const otherSourceAvailable = prioritizedArticles.some((candidate, candidateIndex) => {
          if (candidateIndex === index) {
            return false;
          }

          const candidateSourceKey = getSafeSourceLabel(candidate.source).trim().toLowerCase();
          return candidateSourceKey !== sourceKey && (selectedSourceUsage.get(candidateSourceKey) ?? 0) < 2;
        });

        const alternativeCategoryAvailable = prioritizedArticles.some(
          (candidate, candidateIndex) => {
            if (candidateIndex === index) {
              return false;
            }

            return getSafeCategoryLabel(candidate.category, candidate).trim().toLowerCase() !== categoryKey;
          }
        );

        if (sourceUseCount >= 2 && otherSourceAvailable) {
          continue;
        }

        if (sourceKey === lastSourceKey && otherSourceAvailable) {
          continue;
        }

        if (categoryKey === lastCategoryKey && alternativeCategoryAvailable) {
          continue;
        }

        if (selectedIndex === -1) {
          selectedIndex = index;
        }
      }

      const nextArticle = prioritizedArticles.splice(selectedIndex >= 0 ? selectedIndex : 0, 1)[0];
      diversifiedTopArticles.push(nextArticle);

      const sourceKey = getSafeSourceLabel(nextArticle.source).trim().toLowerCase();
      const categoryKey = getSafeCategoryLabel(nextArticle.category, nextArticle).trim().toLowerCase();
      lastSourceKey = sourceKey;
      lastCategoryKey = categoryKey;
      selectedSourceUsage.set(sourceKey, (selectedSourceUsage.get(sourceKey) ?? 0) + 1);
    }

    return [...diversifiedTopArticles, ...prioritizedArticles];
  }, [sortMode, visibleArticles]);

  const trendingRenderItems = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as TrendingFeedItem[];
    }

    const items: TrendingFeedItem[] = [];
    let insertedVideos = 0;
    let articleCount = 0;

    balancedTrendingArticles.forEach((article) => {
      items.push({
        type: "article",
        key: `article:${article.id}:${article.url ?? ""}`,
        article,
      });
      articleCount += 1;

      if (videos.length > insertedVideos && articleCount % 4 === 0) {
        const video = videos[insertedVideos];

        if (video?.id && video?.title && video?.creator) {
          items.push({
            type: "video",
            key: `video:${video.id}`,
            video,
          });
        }

        insertedVideos += 1;
      }
    });

    while (insertedVideos < videos.length) {
      const video = videos[insertedVideos];

      if (video?.id && video?.title && video?.creator) {
        items.push({
          type: "video",
          key: `video:${video.id}`,
          video,
        });
      }

      insertedVideos += 1;
    }

    return items;
  }, [balancedTrendingArticles, sortMode, videos]);

  const myFeedRenderItems = useMemo(() => {
    if (sortMode !== "my-feed") {
      return [];
    }

    const items: Array<
      | { type: "article"; key: string; article: Article }
      | { type: "poll"; key: string; poll: PollWithResults }
    > = visibleArticles.map((article) => ({
      type: "article" as const,
      key: `article:${article.id}:${article.url ?? ""}`,
      article,
    }));

    myFeedPolls.forEach((poll, index) => {
      items.splice(Math.min(items.length, 2 + index * 5), 0, {
        type: "poll" as const,
        key: `poll:${poll.id}`,
        poll,
      });
    });

    return items;
  }, [myFeedPolls, sortMode, visibleArticles]);

  useEffect(() => {
    console.log(
      "TRENDING RENDER COUNT",
      sortMode === "trending" ? trendingRenderItems.length : visibleArticles.length
    );
    if (sortMode === "trending") {
      console.log("TRENDING ITEMS COUNT", trendingRenderItems.length);
    }
  }, [sortMode, trendingRenderItems.length, visibleArticles.length]);

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    balancedTrendingArticles
      .slice(0, 10)
      .forEach((article) => {
        const selectedImage = getBestArticleImage(article);
        console.log("TRENDING IMAGE SELECTED", {
          title: article.title,
          source: article.source,
          imageUrl: selectedImage.src,
          selectedFrom: selectedImage.source,
        });
      });
  }, [balancedTrendingArticles, sortMode]);

  const renderArticleFeedCard = (
    article: Article,
    options?: {
      rankLabel?: string | null;
      showFreshnessTime?: boolean;
    }
  ) => {
    try {
      const safeSourceName = getSafeSourceLabel(article.source);
      const safeCategoryName = getSafeCategoryLabel(article.category, article);
      const selectedImage = getBestArticleImage(article);
      const imageSrc = selectedImage.src;
      const imageFailureKey = imageSrc ? `${article.id}:${imageSrc}` : `${article.id}:none`;
      const shouldShowImage = Boolean(imageSrc) && !failedArticleImages[imageFailureKey];
      const shouldUseLargeImage =
        shouldShowImage &&
        isLikelyHighQualityArticleImage(selectedImage.source, imageSrc) &&
        (selectedImage.source === "urlToImage" ||
          selectedImage.source === "imageUrl" ||
          selectedImage.source === "image" ||
          selectedImage.source === "ogImage" ||
          selectedImage.source === "twitterImage" ||
          selectedImage.source === "mediaContent");
      const publishedLabel = options?.showFreshnessTime
        ? formatFreshnessTime(article.publishedAt, article.time)
        : formatPublishedDate(article.publishedAt, article.time);

      return (
        <article
          className={`news-card ${options?.rankLabel ? "news-card-has-rank" : ""}`}
        >
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              <Link
                href={`/source/${slugifySourceName(safeSourceName)}/`}
                className="source-trigger source-trigger-tight trending-source-button"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <div className="trending-source-brand">
                  <SourceBadge sourceName={safeSourceName} />
                  <span className="trending-source-name">{safeSourceName}</span>
                </div>
              </Link>
              <span className="trending-published-date trending-published-date-inline">
                {publishedLabel}
              </span>
            </div>
            <div className="trending-card-top-meta">
              {options?.rankLabel ? (
                <span className="chip trending-rank-badge news-card-rank-badge">
                  {options.rankLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Link href={`/article/${article.id}/`} className="article-link">
            {shouldUseLargeImage ? (
              <div className="news-card-body news-card-body-with-hero">
                <div className="news-card-copy">
                  <div className="trending-title-row">
                    <h3 className="trending-article-title">
                      {cleanDisplayText(article.title)}
                    </h3>
                  </div>
                  {article.description ? (
                    <p className="article-card-summary">
                      {cleanDisplayText(article.description)
                        .split(/(?<=[.!?])\s+/)
                        .slice(0, 2)
                        .join(" ")
                        .trim()}
                    </p>
                  ) : null}
                  <span className="chip chip-accent trending-category-pill trending-category-pill-body">
                    {getCategoryLabel(safeCategoryName)}
                  </span>
                </div>
                <div className="article-hero-shell">
                  <img
                    src={imageSrc as string}
                    alt={cleanDisplayText(article.title)}
                    className="article-image article-image-lg"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      setFailedArticleImages((prev) => {
                        if (prev[imageFailureKey]) {
                          return prev;
                        }

                        return {
                          ...prev,
                          [imageFailureKey]: true,
                        };
                      });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="news-card-body news-card-body-text-only">
                <div className="news-card-copy">
                  <div className="trending-title-row">
                    <h3 className="trending-article-title">
                      {cleanDisplayText(article.title)}
                    </h3>
                  </div>
                  {article.description ? (
                    <p className="article-card-summary">
                      {cleanDisplayText(article.description)
                        .split(/(?<=[.!?])\s+/)
                        .slice(0, 2)
                        .join(" ")
                        .trim()}
                    </p>
                  ) : null}
                  <span className="chip chip-accent trending-category-pill trending-category-pill-body">
                    {getCategoryLabel(safeCategoryName)}
                  </span>
                </div>

                {shouldShowImage ? (
                  <div className="article-thumb-shell article-thumb-shell-inline">
                    <img
                      src={imageSrc as string}
                      alt={cleanDisplayText(article.title)}
                      className="article-thumb-image"
                      loading="lazy"
                      decoding="async"
                      onError={() => {
                        setFailedArticleImages((prev) => {
                          if (prev[imageFailureKey]) {
                            return prev;
                          }

                          return {
                            ...prev,
                            [imageFailureKey]: true,
                          };
                        });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </Link>
          <div className="news-card-footer">
            <div className="engagement-row trending-stats-row news-card-actions">
              <button
                className={`icon-action-pill icon-action-pill-ghost ${
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
                className="icon-action-pill icon-action-pill-ghost"
                onClick={() => {
                  router.push(`/article/${article.id}/#comments`);
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
                title={cleanDisplayText(article.title)}
                url={article.url}
                iconOnly
                className="icon-action-pill-ghost"
              />
              <button
                className={`bookmark-button icon-action-pill-ghost ${
                  article.saved ? "bookmark-button-active" : ""
                }`}
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
          </div>
        </article>
      );
    } catch (error) {
      console.error("TRENDING CARD RENDER ERROR", error);

      return (
        <article className={`news-card ${options?.rankLabel ? "news-card-has-rank" : ""}`}>
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              <div className="trending-source-brand">
                <SourceBadge sourceName={getSafeSourceLabel(article.source)} />
                <span className="trending-source-name">{getSafeSourceLabel(article.source)}</span>
              </div>
            </div>
            <div className="trending-card-top-meta">
              {options?.rankLabel ? (
                <span className="chip trending-rank-badge news-card-rank-badge">
                  {options.rankLabel}
                </span>
              ) : null}
              <span className="chip chip-accent trending-category-pill trending-category-pill-top">
                {getCategoryLabel(getSafeCategoryLabel(article.category, article))}
              </span>
            </div>
          </div>
          <Link href={`/article/${article.id}/`} className="article-link">
            <div className="news-card-body news-card-body-text-only">
              <div className="news-card-copy">
                <h3 className="trending-article-title">{cleanDisplayText(article.title)}</h3>
              </div>
            </div>
          </Link>
          <div className="news-card-footer">
            <span className="trending-published-date">
              {options?.showFreshnessTime
                ? formatFreshnessTime(article.publishedAt, article.time)
                : formatPublishedDate(article.publishedAt, article.time)}
            </span>
          </div>
        </article>
      );
    }
  };

  const renderTrendingFeedItem = (item: TrendingFeedItem, rankedIndex: number) => {
    try {
      if (item.type === "article") {
        if (!item.article?.id || !item.article?.title) {
          console.error("TRENDING ITEM RENDER FAILED", item, new Error("Malformed article item"));
          return null;
        }

        return renderArticleFeedCard(item.article, {
          rankLabel: rankedIndex < 25 ? `Top ${rankedIndex + 1}` : null,
        });
      }

      if (!item.video?.id || !item.video?.title || !item.video?.creator) {
        console.error("TRENDING ITEM RENDER FAILED", item, new Error("Malformed video item"));
        return null;
      }

        return (
          <VideoFeedCard
            video={item.video}
            isAutoplaying={autoplayTrendingVideoId === item.video.id && !item.video.fallback}
            onToggleLike={handleToggleVideoLike}
            onToggleSave={handleToggleVideoSave}
            onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
            onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
            frameRef={(node) => {
              trendingVideoFrameRefs.current[item.video.id] = node;
            }}
            label="Video"
            rankBadgeLabel={rankedIndex < 25 ? `Top ${rankedIndex + 1}` : null}
            className="video-card-inline"
          variant="article"
        />
      );
    } catch (error) {
      console.error("TRENDING ITEM RENDER FAILED", item, error);
      return null;
    }
  };

  if (
    sortMode === "trending" &&
    isInitialFeedLoading &&
    visibleArticles.length === 0 &&
    !feedLoadError
  ) {
    return <LoadingScreen label="Loading Graffiti" message="Loading live stories..." />;
  }

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
              <button
                className={`toolbar-pill ${
                  sortMode === "local" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setSortMode("local")}
              >
                Local
              </button>
            </div>
          </div>
        </div>
      </div>

      {sortMode === "local" ? (
        <div className="section-card stack local-feed-shell">
          <div className="local-feed-top-row">
            <span className="local-feed-selected-label">
              {!localQuery ? "Finding nearby news..." : `Showing: ${localLocationLabel}`}
            </span>
          </div>
          <div className="local-feed-controls">
            <div className="local-feed-input-shell">
              <input
                className="search-input local-feed-input"
                type="text"
                placeholder="Enter a major city"
                value={localQueryDraft}
                onFocus={() => setIsLocalAutocompleteOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => {
                    setIsLocalAutocompleteOpen(false);
                  }, 120);
                }}
                onChange={(event) => {
                  setLocalQueryDraft(event.target.value);
                  setLocalSearchStatus(null);
                  setIsLocalAutocompleteOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setIsLocalAutocompleteOpen(false);
                    void handleUpdateLocalQuery();
                  }
                }}
              />
              {isLocalAutocompleteOpen && localCitySuggestions.length > 0 ? (
                <div
                  className="local-city-dropdown"
                  role="listbox"
                  aria-label="Suggested cities"
                >
                  {localCitySuggestions.map((city) => (
                    <button
                      key={city}
                      type="button"
                      className="local-city-dropdown-item"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setLocalQueryDraft(city);
                        setLocalLocationLabel(city);
                        setLocalQuery(buildLocalNewsQuery({ label: city }));
                        setLocalSearchStatus(null);
                        setIsLocalAutocompleteOpen(false);
                      }}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="button button-secondary local-feed-button"
              onClick={() => {
                setIsLocalAutocompleteOpen(false);
                void handleUpdateLocalQuery();
              }}
            >
              Update
            </button>
          </div>
          <div className="local-feed-chip-row" role="list" aria-label="Supported local cities">
            {LOCAL_CITY_SUGGESTIONS.map((city) => (
              <button
                key={city}
                type="button"
                className={`chip local-feed-city-chip ${
                  localLocationLabel === city ? "local-feed-city-chip-active" : ""
                }`}
                onClick={() => {
                  setLocalQueryDraft(city);
                  setLocalLocationLabel(city);
                  setLocalQuery(buildLocalNewsQuery({ label: city }));
                  setLocalSearchStatus(null);
                }}
              >
                {city}
              </button>
            ))}
          </div>
          {localSearchStatus ? (
            <p className="settings-detail-note">{localSearchStatus}</p>
          ) : null}
        </div>
      ) : null}

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

      {sortMode === "my-feed" && categories.length === 0 && myFeedPolls.length === 0 ? (
        <div className="empty-state">
          <strong>No categories selected</strong>
          <span>Choose categories in Profile to build your personalized feed.</span>
        </div>
      ) : visibleArticles.length === 0 &&
        !(sortMode === "my-feed" && myFeedRenderItems.length > 0) ? (
        <div className="empty-state">
          <strong>
            {feedLoadError
              ? "Couldn’t load stories."
              : sortMode === "my-feed"
              ? "No articles found"
              : sortMode === "local"
              ? "No strong local stories found yet"
              : "No stories yet"}
          </strong>
          <span>
            {feedLoadError
              ? "Tap to retry."
              : sortMode === "my-feed"
              ? "Try adding more categories or check back when new stories land."
              : sortMode === "local"
              ? "Try another nearby major city to get stronger local coverage."
              : "Check back in a moment for fresh stories."}
          </span>
          {feedLoadError && sortMode === "trending" ? (
            <button className="button button-secondary" onClick={handleRetryFeedLoad}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <div className="stack feed-results-stack">
          {feedLoadError ? (
            <div className="feed-inline-error" role="status" aria-live="polite">
              <div className="stack" style={{ gap: "10px" }}>
                <span>
                  {sortMode === "trending"
                    ? "Couldn’t load stories. Tap to retry."
                    : sortMode === "local"
                    ? "No local stories found for this city yet."
                    : feedLoadError}
                </span>
                {sortMode === "trending" || sortMode === "local" ? (
                  <div>
                    <button className="button button-secondary" onClick={handleRetryFeedLoad}>
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {sortMode === "trending"
            ? (() => {
                let rankedItemIndex = -1;

                return trendingRenderItems.map((item, index) => {
                  rankedItemIndex += 1;

                const itemKey =
                  item.type === "article"
                    ? item.article.id || item.article.url || getArticleDeduplicationKey(item.article)
                    : item.key;

                try {
                  return (
                    <div key={itemKey} className="stack">
                      {renderTrendingFeedItem(item, rankedItemIndex)}
                      {(index + 1) % 3 === 0 ? (
                        <AdSlot
                          title="Sponsored placement"
                          copy="This is a clean mobile ad placeholder. Swap in your ad network creative or partner placement later."
                          cta="Learn more"
                        />
                      ) : null}
                    </div>
                  );
                } catch (error) {
                  console.error("TRENDING ITEM RENDER FAILED", item, error);
                  return null;
                }
              });
            })()
            : sortMode === "my-feed"
            ? myFeedRenderItems.map((item) => (
                <div key={item.key} className="stack">
                  {item.type === "poll" ? (
                    <PollCard
                      poll={item.poll}
                      onVote={handleVoteOnPoll}
                      isVoting={activePollVoteId === item.poll.id}
                    />
                  ) : (
                    renderArticleFeedCard(item.article)
                  )}
                </div>
              ))
            : visibleArticles.map((article) => {
                const articleKey =
                  article.id || article.url || getArticleDeduplicationKey(article);

                return (
                  <div key={articleKey} className="stack">
                    {renderArticleFeedCard(article, {
                      showFreshnessTime: sortMode === "latest",
                    })}
                  </div>
                );
              })}
          {isLoadingMoreArticles ? (
            <div className="feed-inline-loading" role="status" aria-live="polite">
              Loading more stories...
            </div>
          ) : null}
          {!isLoading && !isLoadingMoreArticles && !hasMoreArticles ? (
            <div className="feed-inline-end" role="status" aria-live="polite">
              You&apos;re caught up.
            </div>
          ) : null}
          {!isLoading && hasMoreArticles ? (
            <div ref={loadMoreSentinelRef} className="feed-load-sentinel" aria-hidden="true" />
          ) : null}
        </div>
      )}

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
                            href={`/user/${comment.user_id}/`}
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
                                    href={`/user/${reply.user_id}/`}
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
