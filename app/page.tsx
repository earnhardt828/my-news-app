"use client";

import LoadingScreen from "./components/loading-screen";
import PollCard from "./components/poll-card";
import SourceBadge from "./components/source-badge";
import VideoFeedCard from "./components/video-feed-card";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  consumePendingArticleReturnState,
  saveArticleReturnState,
} from "../lib/article-navigation";
import {
  FAVORITE_TEAMS_BY_LEAGUE,
  TEAM_PICKER_LEAGUES,
  type FavoriteLeagueKey,
  type FavoriteTeamOption,
} from "../lib/favorite-teams";
import {
  applyPollVoteUpdate,
  getPollFeedScore,
  hydratePolls,
  type PollRecord,
  type PollWithResults,
} from "../lib/polls";
import { ensureProfileRow, saveProfilePatch } from "../lib/profile-store";
import { formatRelativeTimestamp } from "../lib/relative-time";
import {
  buildLocalNewsQueryText,
  DEFAULT_LOCAL_CITY,
  getLocalCityConfigByKey,
  getLocalCityConfigByName,
  getLocalCityConfigByText,
  LOCAL_CITY_CONFIGS,
  SUPPORTED_LOCAL_CITIES,
} from "../lib/local-news";
import { isCommentAllowed } from "../lib/moderation";
import { hasMappedSourceLogo, slugifySourceName } from "../lib/source-logos";
import { supabase } from "../lib/supabase";
import { rankArticlesWithSourcePreferences } from "../lib/feed-ranking";
import { CATEGORY_OPTIONS, getCategoryLabel, getDisplayCategory } from "../lib/categories";
import { normalizeVideoFeedItems, type VideoApiItem, type VideoItem } from "../lib/video-feed";

const FEED_PAGE_SIZE = 25;
const INITIAL_FEED_WARNING_MS = 4200;
const INITIAL_FEED_TIMEOUT_MS = 5000;
const DIRECT_ROUTE_TIMEOUT_MS = 10000;
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";
const SPORTS_UNIFIED_QUERY =
  "sports news | ESPN top headlines | NFL NBA MLB NHL sports news | Sports Illustrated latest | CBS Sports latest";
const CELEBRITY_FEED_QUERY =
  "celebrity news | celebrity gossip | entertainment news | Hollywood news | music celebrity news | TMZ | People | Entertainment Weekly | E! News | Variety | The Hollywood Reporter | Page Six | Us Weekly | Billboard";
const TECHNOLOGY_FEED_QUERY =
  "technology news | AI news | tech startups | Apple news | Google news | Microsoft news | cybersecurity news | social media news | The Verge | TechCrunch | Wired | Ars Technica | Engadget | CNET | CNBC Tech | Bloomberg Technology";
const TRAVEL_FEED_QUERY =
  "travel news | airline news | airport news | cruise news | tourism news | travel warning | travel advisory | hotel news | vacation travel news | Travel + Leisure | Condé Nast Traveler | AFAR | Skift | The Points Guy | CNN Travel | National Geographic Travel | Lonely Planet | USA Today Travel";
const FOOD_FEED_QUERY =
  "food news | restaurant news | fast food news | food safety | grocery news | recipes news | dining news | Eater | Food & Wine | Bon Appétit | Serious Eats | Restaurant Business | Food Network | CNN Food | USA Today Food";
const BUSINESS_FEED_QUERY =
  "business news | finance news | stock market news | economy news | Wall Street news | CNBC | Bloomberg | Reuters Business | MarketWatch | Yahoo Finance";
const BREAKING_NEWS_FEED_QUERY =
  "breaking news | live updates | just in | developing story | urgent | latest news";
const BREAKING_NEWS_TRUSTED_SOURCES = [
  "AP News",
  "Reuters",
  "CNN",
  "BBC News",
  "NBC News",
  "CBS News",
  "ABC News",
  "The New York Times",
  "The Washington Post",
  "Politico",
  "Bloomberg",
  "NPR",
] as const;

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
  | { type: "video"; key: string; video: VideoItem }
  | {
      type: "module";
      key: string;
      module:
        | { kind: "top-polls"; polls: PollWithResults[] }
        | { kind: "quick-watch"; video: VideoItem }
        | { kind: "celebrity-buzz"; article: Article };
    };

type RankedSourceSummary = {
  sourceName: string;
  likes: number;
  heartedByCurrentUser: boolean;
};

type WeatherCardData = {
  temperature: number;
  weatherLabel: string;
  windMph: number | null;
  cityLabel: string;
};

type FavoriteTeamUpdate = {
  team: FavoriteTeamOption;
  article: Article | null;
};

type SportsScoreLeague = "NFL" | "NBA" | "MLB" | "NHL" | "MLS";

type SportsScoreGame = {
  id: string;
  league: SportsScoreLeague;
  status: "Live" | "Final" | "Today" | "Upcoming";
  homeTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  awayTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  shortDetail: string | null;
  scheduledAt: string | null;
};

function formatTopRankLabel(rank: number) {
  if (rank === 1) return "Top 1 🥇";
  if (rank === 2) return "Top 2 🥈";
  if (rank === 3) return "Top 3 🥉";
  return `Top ${rank}`;
}

function getArticleRouteId(article: { id?: number | null }) {
  return typeof article.id === "number" && Number.isFinite(article.id) && article.id > 0
    ? article.id
    : null;
}

function hasResolvableArticleUrl(article: { url?: string | null }) {
  if (!article.url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(article.url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRenderableArticleRecord(
  article: Pick<Article, "id" | "title" | "url" | "source">
) {
  const routeId = getArticleRouteId(article);
  const title = cleanDisplayText(article.title ?? "");
  const source = cleanDisplayText(article.source ?? "").toLowerCase();

  if (!routeId || !title || !hasResolvableArticleUrl(article)) {
    return false;
  }

  if (source === "source unavailable" || source === "unavailable" || source === "unknown source") {
    return false;
  }

  return true;
}

function persistArticleMetadata(article: Article) {
  if (typeof window === "undefined") {
    return;
  }

  const articleRouteId = getArticleRouteId(article);

  if (!articleRouteId) {
    return;
  }

  try {
    const existingRaw = window.localStorage.getItem(ARTICLE_METADATA_STORAGE_KEY);
    const existingCache = existingRaw
      ? (JSON.parse(existingRaw) as Record<string, Record<string, unknown>>)
      : {};

    existingCache[String(articleRouteId)] = {
      id: articleRouteId,
      title: article.title,
      source: article.source,
      category: article.category,
      time: article.time,
      image: article.image ?? null,
      imageUrl: article.imageUrl ?? null,
      urlToImage: article.urlToImage ?? null,
      mediaContent: article.mediaContent ?? null,
      enclosureUrl: article.enclosureUrl ?? null,
      thumbnail: article.thumbnail ?? null,
      description: article.description ?? null,
      url: article.url ?? null,
      publishedAt: article.publishedAt ?? null,
      content: article.content ?? null,
      storedAt: Date.now(),
    };

    window.localStorage.setItem(ARTICLE_METADATA_STORAGE_KEY, JSON.stringify(existingCache));
  } catch (error) {
    console.error("ARTICLE METADATA CACHE WRITE FAILED", error);
  }
}

const LOCAL_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "Chicago, IL": { latitude: 41.8781, longitude: -87.6298 },
  "Los Angeles, CA": { latitude: 34.0522, longitude: -118.2437 },
  "New York, NY": { latitude: 40.7128, longitude: -74.006 },
  "Atlanta, GA": { latitude: 33.749, longitude: -84.388 },
  "Charlotte, NC": { latitude: 35.2271, longitude: -80.8431 },
  "Austin, TX": { latitude: 30.2672, longitude: -97.7431 },
  "Houston, TX": { latitude: 29.7604, longitude: -95.3698 },
  "Jacksonville, FL": { latitude: 30.3322, longitude: -81.6557 },
  "San Diego, CA": { latitude: 32.7157, longitude: -117.1611 },
  "Dallas, TX": { latitude: 32.7767, longitude: -96.797 },
  "Phoenix, AZ": { latitude: 33.4484, longitude: -112.074 },
  "Philadelphia, PA": { latitude: 39.9526, longitude: -75.1652 },
};

type SupportedLocalCity = keyof typeof LOCAL_CITY_CONFIGS;

type CachedFeedPayload = {
  articles: Article[];
  page: number;
  hasMore: boolean;
  savedAt: string;
};

const LOCAL_METRO_STATE_FALLBACKS: Array<{
  city: SupportedLocalCity;
  states: string[];
  tokens?: string[];
}> = [
  { city: "Charlotte, NC", states: ["north carolina", "south carolina"], tokens: ["charlotte", "mecklenburg", "queen city", "gastonia", "concord", "rock hill"] },
  { city: "Chicago, IL", states: ["illinois"], tokens: ["chicago", "cook county", "evanston", "oak park", "naperville"] },
  { city: "Los Angeles, CA", states: ["california"], tokens: ["los angeles", "hollywood", "pasadena", "santa monica", "burbank", "long beach"] },
  { city: "New York, NY", states: ["new york", "new jersey", "connecticut"], tokens: ["new york", "nyc", "brooklyn", "queens", "bronx", "manhattan", "jersey city"] },
  { city: "Atlanta, GA", states: ["georgia"], tokens: ["atlanta", "fulton county", "buckhead", "decatur"] },
];

function getFeedCacheKey(
  mode:
    | "trending"
    | "latest"
    | "polls"
    | "local"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business"
) {
  return mode === "local"
    ? `graffiti:last-feed:${mode}:charlotte-nc`
    : mode === "sports"
      ? `graffiti:last-feed:${mode}`
      : mode === "celebrity" || mode === "weather"
        ? `graffiti:last-feed:${mode}`
      : `graffiti:last-feed:${mode}`;
}

function readCachedFeedPayload(cacheKey: string): CachedFeedPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(cacheKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as CachedFeedPayload | null;

    if (
      !parsed ||
      !Array.isArray(parsed.articles) ||
      typeof parsed.page !== "number" ||
      typeof parsed.hasMore !== "boolean"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Error reading cached feed payload:", error);
    return null;
  }
}

function writeCachedFeedPayload(cacheKey: string, payload: CachedFeedPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error("Error writing cached feed payload:", error);
  }
}

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

function matchesLookupSignal(text: string, signal: string) {
  const normalizedSignal = normalizeLookupValue(signal);

  if (!normalizedSignal) {
    return false;
  }

  if (normalizedSignal.length <= 3) {
    const escaped = normalizedSignal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }

  return text.includes(normalizedSignal);
}

function getSupportedLocalCityConfig(
  city?: string | null,
  state?: string | null,
  label?: string | null
) {
  const combined = [city, state, label].filter(Boolean).join(" ");
  const config = getLocalCityConfigByText(combined);

  if (!config) {
    return null;
  }

  return [config.displayName, config] as const;
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
    return buildLocalNewsQueryText(localCityMatch[1]);
  }

  const fallbackLabel = label || [city, state].filter(Boolean).join(", ");
  return fallbackLabel ? `${fallbackLabel} local news` : "United States local news";
}

function resolveSupportedMetroCity(options?: {
  city?: string | null;
  state?: string | null;
  label?: string | null;
}): SupportedLocalCity | null {
  const label = cleanDisplayText(options?.label ?? "").trim();
  const city = cleanDisplayText(options?.city ?? "").trim();
  const state = cleanDisplayText(options?.state ?? "").trim();

  const directMatch = getSupportedLocalCityConfig(city, state, label);

  if (directMatch) {
    return directMatch[0] as SupportedLocalCity;
  }

  const haystack = normalizeLookupValue(`${city} ${state} ${label}`);

  for (const fallback of LOCAL_METRO_STATE_FALLBACKS) {
    const stateMatched = fallback.states.some((candidateState) =>
      normalizeLookupValue(`${state} ${label}`).includes(candidateState)
    );
    const tokenMatched = fallback.tokens?.some((token) => haystack.includes(token)) ?? false;

    if (tokenMatched || stateMatched) {
      return fallback.city;
    }
  }

  return null;
}

function getWeatherLabel(weatherCode: number | null | undefined) {
  if (weatherCode === null || weatherCode === undefined) {
    return "Local forecast";
  }

  if (weatherCode === 0) return "Clear";
  if ([1, 2].includes(weatherCode)) return "Partly cloudy";
  if (weatherCode === 3) return "Cloudy";
  if ([45, 48].includes(weatherCode)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "Snow";
  if ([95, 96, 99].includes(weatherCode)) return "Thunderstorms";
  return "Forecast";
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
    const hasLocalSource = localConfig.allowedSources.some((source) =>
      sourceName.includes(normalizeLookupValue(source))
    );
    const hasLocalStorySignal = [
      ...localConfig.strictTerms,
      ...localConfig.sourceAliases,
      localConfig.city,
      localConfig.state,
    ].some((signal) => matchesLookupSignal(articleText, signal));

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
  return formatRelativeTimestamp(publishedAt, fallback);
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
  return formatRelativeTimestamp(timestamp, fallback);
}

function getArticleDeduplicationKey(article: Pick<Article, "id" | "url" | "title" | "source">) {
  const normalizedUrl = (() => {
    try {
      if (!article.url?.trim()) {
        return "";
      }
      const parsed = new URL(article.url.trim());
      parsed.hash = "";
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
      ].forEach((key) => parsed.searchParams.delete(key));
      return parsed.toString().toLowerCase();
    } catch {
      return article.url?.trim().toLowerCase() ?? "";
    }
  })();

  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }

  const normalizedTitle = article.title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");

  return `title:${article.source.trim().toLowerCase()}:${normalizedTitle}`;
}

function mergeArticlesByIdentity(existing: Article[], incoming: Article[]) {
  const merged = [...existing];
  const existingIndexByKey = new Map(
    existing.map((article, index) => [getArticleDeduplicationKey(article), index])
  );

  const getImageScore = (article: Article) =>
    Number(
      Boolean(
        article.urlToImage ||
          article.imageUrl ||
          article.image ||
          article.ogImage ||
          article.mediaContent ||
          article.enclosureUrl
      )
    );

  incoming.forEach((article) => {
    const dedupeKey = getArticleDeduplicationKey(article);
    const existingIndex = existingIndexByKey.get(dedupeKey);

    if (existingIndex !== undefined) {
      const current = merged[existingIndex];
      const currentTime = current.publishedAt ? new Date(current.publishedAt).getTime() : 0;
      const nextTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      const shouldReplace =
        nextTime > currentTime ||
        (nextTime === currentTime && getImageScore(article) > getImageScore(current));

      if (shouldReplace) {
        merged[existingIndex] = {
          ...current,
          ...article,
        };
      }
      return;
    }

    existingIndexByKey.set(dedupeKey, merged.length);
    merged.push(article);
  });

  return merged;
}

function selectSourceBalancedVideos(videos: VideoItem[], limit: number) {
  if (videos.length <= limit) {
    return videos;
  }

  const normalizedSourceCounts = new Map<string, number>();
  const normalizedSources = new Set(
    videos.map((video) => cleanDisplayText(video.creator).trim().toLowerCase()).filter(Boolean)
  );
  const maxPerSource = normalizedSources.size > 1 ? 2 : limit;
  const selected: VideoItem[] = [];
  const deferred: VideoItem[] = [];

  videos.forEach((video) => {
    const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
    const nextCount = (normalizedSourceCounts.get(normalizedSource) ?? 0) + 1;

    if (nextCount <= maxPerSource) {
      normalizedSourceCounts.set(normalizedSource, nextCount);
      selected.push(video);
      return;
    }

    deferred.push(video);
  });

  const remainingSlots = Math.max(0, limit - selected.length);
  return [...selected, ...deferred.slice(0, remainingSlots)].slice(0, limit);
}

function selectSourceBalancedArticles<T extends { source: string }>(articles: T[], limit: number) {
  const prioritizedArticles = [...articles].sort((leftArticle, rightArticle) => {
    const rightScore = getArticlePriorityScore(rightArticle as unknown as Article);
    const leftScore = getArticlePriorityScore(leftArticle as unknown as Article);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return (
      getPublishedAtTimestamp((rightArticle as unknown as Article).publishedAt) -
      getPublishedAtTimestamp((leftArticle as unknown as Article).publishedAt)
    );
  });

  if (prioritizedArticles.length <= limit) {
    return prioritizedArticles;
  }

  const normalizedSourceCounts = new Map<string, number>();
  const normalizedSources = new Set(
    prioritizedArticles
      .map((article) => cleanDisplayText(article.source).trim().toLowerCase())
      .filter(Boolean)
  );
  const maxPerSource = normalizedSources.size > 1 ? 2 : limit;
  const selected: T[] = [];
  const deferred: T[] = [];

  prioritizedArticles.forEach((article) => {
    const normalizedSource = cleanDisplayText(article.source).trim().toLowerCase() || "unknown";
    const nextCount = (normalizedSourceCounts.get(normalizedSource) ?? 0) + 1;

    if (nextCount <= maxPerSource) {
      normalizedSourceCounts.set(normalizedSource, nextCount);
      selected.push(article);
      return;
    }

    deferred.push(article);
  });

  const remainingSlots = Math.max(0, limit - selected.length);
  return [...selected, ...deferred.slice(0, remainingSlots)].slice(0, limit);
}

function normalizeNewsPayload(payload: FeedArticlePayload[] | PaginatedNewsResponse) {
  if (Array.isArray(payload)) {
    const renderableArticles = payload.filter((article) => isRenderableArticleRecord(article));
    return {
      articles: renderableArticles,
      hasMore: false,
      page: 1,
      pageSize: renderableArticles.length,
    };
  }

  const renderableArticles = (payload.articles ?? []).filter((article) =>
    isRenderableArticleRecord(article)
  );

  return {
    articles: renderableArticles,
    hasMore: payload.hasMore ?? false,
    page: payload.page ?? 1,
    pageSize: payload.pageSize ?? renderableArticles.length,
    nextPage: payload.nextPage ?? null,
  };
}

function hydrateFeedArticles(feedArticles: FeedArticlePayload[]) {
  return feedArticles.map((article) => ({
    ...article,
    likes: 0,
    likeUsers: [],
    likedByCurrentUser: false,
    comments: [],
    saved: false,
  })) as Article[];
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

function isSportsPromotionalArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
  return /(betmgm|bonus code|promo code|sportsbook|odds boost|sign up bonus|bet365|fanduel|draftkings|caesars sportsbook|wagering|parlay)/i.test(
    haystack
  );
}

function isSportsVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasSportsTerms =
    /(sports|espn|sportscenter|nfl|nba|mlb|nhl|mls|soccer|football|basketball|baseball|hockey|golf|tennis|nascar|formula 1|formula1|f1|ufc|mma|highlights?|touchdown|dunk|home run|goals?|save|replay|top plays|bleacher report|fox sports|cbs sports|nbc sports|sports illustrated|pga|masters|grand prix|race winner)/.test(
      haystack
    ) || video.category === "Sports";
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress)/.test(
      haystack
    );

  return hasSportsTerms && !hasRejectedTerms;
}

function getArticlePriorityScore(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  }`.toLowerCase();
  let score = 0;

  const source = getSafeSourceLabel(article.source).toLowerCase();

  if (
    /(ap news|associated press|reuters|bbc news|cnn|new york times|washington post|politico|npr|espn|cbs sports|nbc sports|fox sports|yahoo sports|sports illustrated|bleacher report|bloomberg|wall street journal|the weather channel)/.test(
      source
    )
  ) {
    score += 120;
  }

  if (/(breaking|urgent|developing|just in|live updates?|exclusive|major|top story|alert)/.test(haystack)) {
    score += 90;
  }

  if (/(analysis|opinion|newsletter|sponsored|advertiser|promo|bonus code)/.test(haystack)) {
    score -= 70;
  }

  score += Math.min(120, article.likes * 3);
  score += Math.min(80, (article.comments?.length ?? 0) * 6);

  const ageHours = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60))
    : 72;
  score += Math.max(0, 72 - ageHours * 3);

  return score;
}

function getWeatherConditionIconLabel(condition: string | null | undefined) {
  const value = `${condition ?? ""}`.toLowerCase();

  if (/(thunder|storm)/.test(value)) {
    return "storm";
  }

  if (/(snow|sleet|blizzard|ice)/.test(value)) {
    return "snow";
  }

  if (/(rain|showers?|drizzle)/.test(value)) {
    return "rain";
  }

  if (/(wind|breezy|gust)/.test(value)) {
    return "wind";
  }

  if (/(cloud|overcast|fog|mist)/.test(value)) {
    return "cloud";
  }

  if (/(sun|clear|fair)/.test(value)) {
    return "sun";
  }

  return "cloud";
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
  const topTabsRef = useRef<HTMLDivElement | null>(null);
  const cityOptions = SUPPORTED_LOCAL_CITIES;
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<
    | "trending"
    | "polls"
    | "latest"
    | "local"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business"
  >(
    "trending"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [savedLocalCity, setSavedLocalCity] = useState<string | null>(null);
  const [savedLocalState, setSavedLocalState] = useState<string | null>(null);
  const [selectedLocalCityKey, setSelectedLocalCityKey] = useState<string | null>(null);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
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
  const [pollFilter, setPollFilter] = useState<"top" | "following" | "trending">("top");
  const [pollFollowingIds, setPollFollowingIds] = useState<string[]>([]);
  const [activePollVoteId, setActivePollVoteId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [sportsVideos, setSportsVideos] = useState<VideoItem[]>([]);
  const [favoriteTeams, setFavoriteTeams] = useState<FavoriteTeamOption[]>([]);
  const [hasLoadedFavoriteTeams, setHasLoadedFavoriteTeams] = useState(false);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [activeTeamLeague, setActiveTeamLeague] = useState<FavoriteLeagueKey>("NFL");
  const [activeScoresLeague, setActiveScoresLeague] = useState<SportsScoreLeague>("NFL");
  const [sportsScoresByLeague, setSportsScoresByLeague] = useState<
    Record<SportsScoreLeague, SportsScoreGame[]>
  >({
    NFL: [],
    NBA: [],
    MLB: [],
    NHL: [],
    MLS: [],
  });
  const [isSportsScoresLoading, setIsSportsScoresLoading] = useState(false);
  const [areSportsScoresAvailable, setAreSportsScoresAvailable] = useState(true);
  const [autoplayTrendingVideoKeys, setAutoplayTrendingVideoKeys] = useState<string[]>([]);
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
  const [localLocationLabel, setLocalLocationLabel] = useState("");
  const [isLocalAutocompleteOpen, setIsLocalAutocompleteOpen] = useState(false);
  const [, setLocalSearchStatus] = useState<string | null>(null);
  const [isLocalAreaLoading, setIsLocalAreaLoading] = useState(false);
  const [categorySectionArticles, setCategorySectionArticles] = useState<Article[]>([]);
  const [isCategorySectionLoading, setIsCategorySectionLoading] = useState(false);
  const [homeSourceRankings, setHomeSourceRankings] = useState<RankedSourceSummary[]>([]);
  const [isHomeSourceRankingsLoading, setIsHomeSourceRankingsLoading] = useState(false);
  const [weatherCard, setWeatherCard] = useState<WeatherCardData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherNewsArticles, setWeatherNewsArticles] = useState<Article[]>([]);
  const [isWeatherNewsLoading, setIsWeatherNewsLoading] = useState(false);
  const [breakingPreviewArticles, setBreakingPreviewArticles] = useState<Article[]>([]);
  const [isBreakingPreviewLoading, setIsBreakingPreviewLoading] = useState(false);
  const [sportsPreviewArticles, setSportsPreviewArticles] = useState<Article[]>([]);
  const [isSportsPreviewLoading, setIsSportsPreviewLoading] = useState(false);
  const [celebrityPreviewArticles, setCelebrityPreviewArticles] = useState<Article[]>([]);
  const [isCelebrityPreviewLoading, setIsCelebrityPreviewLoading] = useState(false);
  const [technologyPreviewArticles, setTechnologyPreviewArticles] = useState<Article[]>([]);
  const [isTechnologyPreviewLoading, setIsTechnologyPreviewLoading] = useState(false);
  const [businessPreviewArticles, setBusinessPreviewArticles] = useState<Article[]>([]);
  const [isBusinessPreviewLoading, setIsBusinessPreviewLoading] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const trendingVideoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const teamPickerPagesRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextPageRef = useRef(false);
  const activeFeedRequestIdRef = useRef(0);
  const [replyTarget, setReplyTarget] = useState<{
    articleId: number;
    commentId: number;
    username: string | null;
  } | null>(null);

  useEffect(() => {
    console.log("APP RENDERED");
  }, []);

  const favoriteTeamsStorageKey = "favoriteSportsTeams";

  useEffect(() => {
    console.log(
      "SUPPORTED LOCAL CITIES",
      SUPPORTED_LOCAL_CITIES.map((city) => city.displayName)
    );
  }, []);

  useEffect(() => {
    console.log(
      "LOCAL CITY OPTIONS RENDERED",
      cityOptions.map((city) => city.displayName)
    );
  }, [cityOptions]);

  useEffect(() => {
    if (!isTeamPickerOpen) {
      return;
    }

    const node = teamPickerPagesRef.current;
    const leagueIndex = TEAM_PICKER_LEAGUES.indexOf(activeTeamLeague);

    if (!node || leagueIndex < 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      node.scrollLeft = node.clientWidth * leagueIndex;
    });
  }, [activeTeamLeague, isTeamPickerOpen]);

  useEffect(() => {
    let isMounted = true;

    async function loadSportsScores() {
      if (sortMode !== "sports") {
        return;
      }

      setIsSportsScoresLoading(true);

      try {
        const response = await apiFetch("/api/sports-scores");
        const payload = (await response.json()) as {
          providerConfigured: boolean;
          leagues: Partial<Record<SportsScoreLeague, SportsScoreGame[]>>;
        };

        if (!isMounted) {
          return;
        }

        setAreSportsScoresAvailable(payload.providerConfigured);
        setSportsScoresByLeague({
          NFL: payload.leagues.NFL ?? [],
          NBA: payload.leagues.NBA ?? [],
          MLB: payload.leagues.MLB ?? [],
          NHL: payload.leagues.NHL ?? [],
          MLS: payload.leagues.MLS ?? [],
        });
      } catch (error) {
        console.error("SPORTS SCORES LOAD FAILED", error);

        if (!isMounted) {
          return;
        }

        setAreSportsScoresAvailable(false);
        setSportsScoresByLeague({
          NFL: [],
          NBA: [],
          MLB: [],
          NHL: [],
          MLS: [],
        });
      } finally {
        if (isMounted) {
          setIsSportsScoresLoading(false);
        }
      }
    }

    void loadSportsScores();

    return () => {
      isMounted = false;
    };
  }, [sortMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("FOUND LOADING ARTICLES COMPONENT");
      console.log("CURRENT ROUTE", window.location.pathname);
    }
    console.log("TRENDING LOADING STATE", isLoading);
    console.log("ARTICLES COUNT", articles.length);
    console.log("LOADING STATE", isLoading);
  }, [articles.length, isLoading]);


  const feedMode:
    | "trending"
    | "latest"
    | "local"
    | "polls"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business" = useMemo(() => {
    if (sortMode === "latest") {
      return "latest";
    }

    if (sortMode === "polls") {
      return "polls";
    }

    if (sortMode === "local") {
      return "local";
    }

    if (sortMode === "sports") {
      return "sports";
    }

    if (sortMode === "celebrity") {
      return "celebrity";
    }

    if (sortMode === "weather") {
      return "weather";
    }

    if (sortMode === "technology") {
      return "technology";
    }

    if (sortMode === "travel") {
      return "travel";
    }

    if (sortMode === "food") {
      return "food";
    }

    if (sortMode === "business") {
      return "business";
    }

    return "trending";
  }, [sortMode]);

  const categoryReloadKey = "__ignore-categories__";
  const isMyFeedWithoutCategories = false;
  const selectedLocalConfig = useMemo(() => {
    if (selectedLocalCityKey) {
      return getLocalCityConfigByKey(selectedLocalCityKey);
    }

    const resolvedCity = resolveSupportedMetroCity({
      label: localLocationLabel,
      city: localQueryDraft,
    });

    return resolvedCity ? getLocalCityConfigByName(resolvedCity) : null;
  }, [localLocationLabel, localQueryDraft, selectedLocalCityKey]);
  const selectedLocalCity = selectedLocalConfig?.displayName ?? null;
  const localEmptyStateHeadline = useMemo(() => {
    if (!selectedLocalCity) {
      return "Choose your city to see local stories.";
    }
    const cityLabel = selectedLocalCity ?? localLocationLabel;
    const cityName = cleanDisplayText(cityLabel).split(",")[0]?.trim();
    return cityName
      ? `No local stories found for ${cityName} yet.`
      : "No local stories found for this city yet.";
  }, [localLocationLabel, selectedLocalCity]);

  const loadFeedPage = useCallback(async (pageToLoad: number, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;
    const requestId = activeFeedRequestIdRef.current + 1;
    const feedCacheKey = getFeedCacheKey(feedMode);
    const bypassDirectFeedCache = feedMode === "local" || feedMode === "weather";
    const activeFeedTimeoutMs = bypassDirectFeedCache
      ? DIRECT_ROUTE_TIMEOUT_MS
      : INITIAL_FEED_TIMEOUT_MS;
    const cachedFeed = replace && !bypassDirectFeedCache ? readCachedFeedPayload(feedCacheKey) : null;
    activeFeedRequestIdRef.current = requestId;

    const isCurrentRequest = () => activeFeedRequestIdRef.current === requestId;
    let hasLiveNewsResponse = false;
    let initialLoadTimeoutId: number | null = null;
    let initialLoadWarningTimeoutId: number | null = null;
    let articleFetchTimeoutId: number | null = null;

    if (!replace && isFetchingNextPageRef.current) {
      return;
    }

    if (feedMode === "polls") {
      if (replace) {
        setFeedLoadError(null);
        setArticles([]);
        setFeedPage(1);
        setHasMoreArticles(false);
        setIsInitialFeedLoading(false);
        setIsLoading(false);
        setIsLoadingMoreArticles(false);
      }
      return;
    }

      if (replace) {
        if (feedMode === "local") {
          setIsLocalAreaLoading(true);
          setFeedLoadError(null);
          setArticles([]);
        } else {
          setIsLoading(true);
          setFeedLoadError(null);
        }
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
            timeoutMs: activeFeedTimeoutMs,
          });
          if (cachedFeed) {
            setFeedLoadError("Showing the last loaded stories while we retry.");
            setArticles(cachedFeed.articles);
            setHasMoreArticles(cachedFeed.hasMore);
            setFeedPage(cachedFeed.page);
          } else {
            setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
            setArticles([]);
            setHasMoreArticles(false);
            setFeedPage(1);
          }
          setIsInitialFeedLoading(false);
          isFetchingNextPageRef.current = false;
          setIsLocalAreaLoading(false);
          setIsLoading(false);
          setIsLoadingMoreArticles(false);
        }, activeFeedTimeoutMs);
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
      setUserEmail(userData.user?.email ?? null);

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
        console.log("PROFILE LOCAL CITY", profile?.local_city ?? null, profile?.local_state ?? null);
        setSavedLocalCity(profile?.local_city ?? null);
        setSavedLocalState(profile?.local_state ?? null);
        setPreferredSources(profile?.preferred_sources ?? []);
        setShowLessSources(profile?.show_less_sources ?? []);
      } else {
        setUserEmail(null);
        setUsername(null);
        setCategories([]);
        setSavedLocalCity(null);
        setSavedLocalState(null);
        setPreferredSources([]);
        setShowLessSources([]);
      }

      let newsPath = "";
      let newsPayload: PaginatedNewsResponse | null = null;

      if (feedMode === "local") {
        newsPath =
          selectedLocalCityKey === "new-york-ny"
            ? "/api/local/new-york"
            : selectedLocalCityKey === "los-angeles-ca"
              ? "/api/local/los-angeles"
                : selectedLocalCityKey === "chicago-il"
                  ? "/api/local/chicago"
                : selectedLocalCityKey === "houston-tx"
                  ? "/api/local/houston"
                  : selectedLocalCityKey === "austin-tx"
                    ? "/api/local/austin"
                  : selectedLocalCityKey === "jacksonville-fl"
                    ? "/api/local/jacksonville"
                  : selectedLocalCityKey === "dallas-tx"
                    ? "/api/local/dallas"
                  : selectedLocalCityKey === "phoenix-az"
                    ? "/api/local/phoenix"
                    : selectedLocalCityKey === "san-diego-ca"
                      ? "/api/local/san-diego"
                      : selectedLocalCityKey === "san-antonio-tx"
                        ? "/api/local/san-antonio"
                        : selectedLocalCityKey === "philadelphia-pa"
                          ? "/api/local/philadelphia"
                          : "/api/local/charlotte";
      } else {
        const params = new URLSearchParams({
          mode: feedMode,
          page: String(pageToLoad),
          pageSize: String(FEED_PAGE_SIZE),
        });

        if (feedMode === "sports") {
          params.set("query", SPORTS_UNIFIED_QUERY);
        } else if (feedMode === "celebrity") {
          params.set("query", CELEBRITY_FEED_QUERY);
        } else if (feedMode === "weather") {
          newsPath = "/api/weather-news";
        } else if (feedMode === "technology") {
          params.set("query", TECHNOLOGY_FEED_QUERY);
        } else if (feedMode === "travel") {
          params.set("query", TRAVEL_FEED_QUERY);
        } else if (feedMode === "food") {
          params.set("query", FOOD_FEED_QUERY);
        } else if (feedMode === "business") {
          params.set("query", BUSINESS_FEED_QUERY);
        }
        if (!newsPath) {
          newsPath = `/api/news?${params.toString()}`;
        }
      }

      {
        const newsUrl = buildApiUrl(newsPath);
        console.log("TRENDING FETCH URL", newsUrl);

        const articleFetchController =
          replace && typeof AbortController !== "undefined" ? new AbortController() : null;

        if (replace && typeof window !== "undefined" && articleFetchController) {
          articleFetchTimeoutId = window.setTimeout(() => {
            articleFetchController.abort();
          }, activeFeedTimeoutMs);
        }

        const newsRes = await apiFetch(newsPath, {
          cache: bypassDirectFeedCache ? "no-store" : undefined,
          signal: articleFetchController?.signal,
        });

        if (!isCurrentRequest()) {
          return;
        }

        if (!newsRes.ok) {
          throw new Error(`Home feed request failed with status ${newsRes.status}`);
        }

        newsPayload = normalizeNewsPayload(
          (await newsRes.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );
      }

      console.log("NEWS API DATA", newsPayload);
      console.log("TRENDING FETCH RESPONSE", newsPayload);

      if (!isCurrentRequest()) {
        return;
      }

      const newsData = newsPayload?.articles ?? [];
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
        if (feedMode === "local") {
          console.error("LOCAL FETCH ERROR", emptyResponseError);
        }
        if (cachedFeed) {
          setFeedLoadError(
            sortMode === "local"
              ? localEmptyStateHeadline
              : "Showing the last loaded stories while we retry."
          );
          setArticles(cachedFeed.articles);
          setHasMoreArticles(cachedFeed.hasMore);
          setFeedPage(cachedFeed.page);
        } else {
          setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
          setArticles([]);
          setHasMoreArticles(false);
          setFeedPage(1);
        }
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
      setFeedLoadError(
          replace && receivedFallbackFeed && sortMode !== "local"
            ? "Showing the last loaded stories while we retry."
            : null
        );
      setHasMoreArticles(receivedFallbackFeed ? false : (newsPayload?.hasMore ?? false));
      setFeedPage(pageToLoad);
      setArticles((prev) => {
        const nextArticles =
          receivedFallbackFeed && replace
            ? cachedFeed?.articles ?? prev
            : replace
              ? mergedArticles
              : mergeArticlesByIdentity(prev, mergedArticles);
        console.log("ARTICLES USED", nextArticles);
        console.log("TRENDING FINAL COUNT", nextArticles.length);
        if (nextArticles.length > 0 && !bypassDirectFeedCache) {
          writeCachedFeedPayload(feedCacheKey, {
            articles: nextArticles,
            page: pageToLoad,
            hasMore: receivedFallbackFeed ? false : (newsPayload?.hasMore ?? false),
            savedAt: new Date().toISOString(),
          });
        }
        return nextArticles;
      });
      if (feedMode === "local") {
        console.log("LOCAL SELECTED CITY", selectedLocalCity ?? localLocationLabel);
        console.log("LOCAL ARTICLES COUNT", newsData.length);
      }
      if (replace) {
        setIsInitialFeedLoading(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      console.log("TRENDING FETCH ERROR", error);
      if (feedMode === "local") {
        console.error("LOCAL FETCH ERROR", error);
      }
      console.error("INITIAL APP LOAD FAILED", error);
      if (replace && !hasLiveNewsResponse) {
        if (cachedFeed) {
          setFeedLoadError(
            sortMode === "local" ? null : "Showing the last loaded stories while we retry."
          );
          setArticles(cachedFeed.articles);
          setHasMoreArticles(cachedFeed.hasMore);
          setFeedPage(cachedFeed.page);
        } else {
          setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
          setArticles([]);
          setHasMoreArticles(false);
          setFeedPage(1);
        }
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
      setIsLocalAreaLoading(false);
      console.log("SETTING LOADING FALSE");
      setIsLoading(false);
      setIsLoadingMoreArticles(false);
    }
  }, [
    feedMode,
    localEmptyStateHeadline,
    localLocationLabel,
    selectedLocalCity,
    selectedLocalCityKey,
    sortMode,
  ]);

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
      const { data: followRowsData, error: followRowsError } = userId
        ? await supabase
            .from("user_follows")
            .select("following_id")
            .eq("follower_id", userId)
        : { data: [], error: null };

      if (followRowsError) {
        console.error("Error loading follows for Polls tab:", followRowsError);
      }

      const pollUserIds = Array.from(
        new Set([
          ...(userId ? [userId] : []),
          ...(((followRowsData ?? []) as { following_id: string }[]).map(
            (followRow) => followRow.following_id
          )),
        ])
      );
      setPollFollowingIds(pollUserIds);

      const [followedPollsResult, recentPollsResult] = await Promise.all([
        pollUserIds.length
          ? supabase
              .from("polls")
              .select(
                "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
              )
              .eq("status", "active")
              .in("user_id", pollUserIds)
              .order("created_at", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] as PollRecord[], error: null }),
        supabase
          .from("polls")
          .select(
            "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
          )
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (followedPollsResult.error) {
        console.error("Error loading followed polls:", followedPollsResult.error);
      }

      if (recentPollsResult.error) {
        console.error("Error loading recent polls:", recentPollsResult.error);
      }

      const mergedPollRows = [
        ...(((followedPollsResult.data ?? []) as PollRecord[]) ?? []),
        ...(((recentPollsResult.data ?? []) as PollRecord[]) ?? []),
      ];
      const dedupedPollRows = Array.from(
        new Map(mergedPollRows.map((poll) => [poll.id, poll])).values()
      );
      const hydratedPolls = await hydratePolls(supabase, dedupedPollRows, userId);

      setMyFeedPolls(hydratedPolls);
    }

    void loadPolls();
  }, [userId]);

  useEffect(() => {
    async function loadTrendingVideos() {
      try {
        const [newsResponse, sportsResponse] = await Promise.all([
          apiFetch("/api/videos?tab=news"),
          apiFetch("/api/videos?tab=sports"),
        ]);

        if (!newsResponse.ok) {
          const responseText = await newsResponse.text();
          throw new Error(`Trending news videos request failed (${newsResponse.status}): ${responseText}`);
        }

        if (!sportsResponse.ok) {
          const responseText = await sportsResponse.text();
          throw new Error(`Trending sports videos request failed (${sportsResponse.status}): ${responseText}`);
        }

        const [newsData, sportsData] = await Promise.all([
          newsResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
          sportsResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
        ]);

        if (newsData.fallback) {
          console.error("Trending news videos fallback used", {
            message: newsData.message ?? "Unknown reason",
          });
        }

        if (sportsData.fallback) {
          console.error("Trending sports videos fallback used", {
            message: sportsData.message ?? "Unknown reason",
          });
        }

        const sortVerticalFirst = (items: VideoItem[]) =>
          items.sort((left, right) => {
            const leftHint = `${left.title} ${left.watchUrl} ${left.thumbnailUrl ?? ""}`.toLowerCase();
            const rightHint = `${right.title} ${right.watchUrl} ${right.thumbnailUrl ?? ""}`.toLowerCase();
            const leftVerticalScore =
              (left.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(leftHint) ? 1 : 0);
            const rightVerticalScore =
              (right.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(rightHint) ? 1 : 0);

            if (rightVerticalScore !== leftVerticalScore) {
              return rightVerticalScore - leftVerticalScore;
            }

            return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
          });

        setVideos(
          sortVerticalFirst(normalizeVideoFeedItems(newsData.videos).filter((video) => !video.fallback))
        );
        setSportsVideos(
          sortVerticalFirst(normalizeVideoFeedItems(sportsData.videos).filter((video) => !video.fallback))
        );
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos([]);
        setSportsVideos([]);
      }
    }

    void loadTrendingVideos();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadCategorySection() {
      if (categories.length === 0) {
        if (!isCancelled) {
          setCategorySectionArticles([]);
          setIsCategorySectionLoading(false);
        }
        return;
      }

      setIsCategorySectionLoading(true);

      try {
        const responses = await Promise.allSettled(
          categories.slice(0, 4).map(async (category) => {
            const response = await apiFetch(
              `/api/news?mode=myfeed&category=${encodeURIComponent(category)}&page=1&pageSize=8`
            );

            if (!response.ok) {
              throw new Error(`Category feed request failed (${response.status})`);
            }

            return hydrateFeedArticles(
              normalizeNewsPayload(
                (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            );
          })
        );

        if (isCancelled) {
          return;
        }

        const mergedArticles = responses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("Category section fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        setCategorySectionArticles(mergedArticles);
      } catch (error) {
        console.error("Error loading category section:", error);
        if (!isCancelled) {
          setCategorySectionArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsCategorySectionLoading(false);
        }
      }
    }

    void loadCategorySection();

    return () => {
      isCancelled = true;
    };
  }, [categories]);

  useEffect(() => {
    let isCancelled = false;

    async function loadHomeSourceRankings() {
      setIsHomeSourceRankingsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("source_ratings")
          .select("id, user_id, source_name, rating");

        if (error) {
          throw error;
        }

        const ratings = (data ?? []) as Array<{
          user_id: string;
          source_name: string;
          rating: "like" | "dislike";
        }>;
        const currentUserId = user?.id ?? null;
        const sourceMap = new Map<string, RankedSourceSummary>();

        ratings.forEach((rating) => {
          const current = sourceMap.get(rating.source_name) ?? {
            sourceName: rating.source_name,
            likes: 0,
            heartedByCurrentUser: false,
          };

          if (rating.rating === "like") {
            current.likes += 1;
          }

          if (currentUserId && rating.user_id === currentUserId && rating.rating === "like") {
            current.heartedByCurrentUser = true;
          }

          sourceMap.set(rating.source_name, current);
        });

        if (isCancelled) {
          return;
        }

        setHomeSourceRankings(
          [...sourceMap.values()]
            .filter((source) => source.likes > 0)
            .sort((left, right) => {
              if (right.likes !== left.likes) {
                return right.likes - left.likes;
              }

              return left.sourceName.localeCompare(right.sourceName);
            })
            .slice(0, 6)
        );
      } catch (error) {
        console.error("Error loading home source rankings:", error);
        if (!isCancelled) {
          setHomeSourceRankings([]);
        }
      } finally {
        if (!isCancelled) {
          setIsHomeSourceRankingsLoading(false);
        }
      }
    }

    void loadHomeSourceRankings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handlePromptSourceHeart = useCallback(
    (event: MouseEvent<HTMLButtonElement>, sourceName: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (!userId) {
        alert("Log in to heart sources.");
        return;
      }

      const targetSlug = slugifySourceName(sourceName);
      router.push(`/source/${targetSlug}/`);
    },
    [router, userId]
  );

  useEffect(() => {
    const city = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    let isCancelled = false;

    async function loadWeatherCard() {
      const weatherLocation = city;
      console.log("LOCAL WEATHER LOCATION", weatherLocation);
      const coords = LOCAL_CITY_COORDINATES[city];

      if (!coords) {
        if (!isCancelled) {
          setWeatherCard(null);
          setIsWeatherLoading(false);
        }
        return;
      }

      setIsWeatherLoading(true);

      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Weather request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          current?: {
            temperature_2m?: number;
            weather_code?: number;
            wind_speed_10m?: number;
          };
        };

        if (
          isCancelled ||
          typeof payload.current?.temperature_2m !== "number"
        ) {
          return;
        }

        setWeatherCard({
          temperature: payload.current.temperature_2m,
          weatherLabel: getWeatherLabel(payload.current.weather_code),
          windMph: payload.current.wind_speed_10m ?? null,
          cityLabel: city,
        });
      } catch (error) {
        console.error("LOCAL WEATHER ERROR", error);
        if (!isCancelled) {
          setWeatherCard(null);
        }
      } finally {
        if (!isCancelled) {
          setIsWeatherLoading(false);
        }
      }
    }

    void loadWeatherCard();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocalCity]);

  useEffect(() => {
    let isCancelled = false;
    const weatherFetchController =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      typeof window !== "undefined" && weatherFetchController
        ? window.setTimeout(() => {
            weatherFetchController.abort();
          }, DIRECT_ROUTE_TIMEOUT_MS)
        : null;

    async function loadWeatherNews() {
      setIsWeatherNewsLoading(true);

      try {
        const response = await apiFetch("/api/weather-news", {
          cache: "no-store",
          signal: weatherFetchController?.signal,
        });

        if (!response.ok) {
          throw new Error(`Weather news request failed (${response.status})`);
        }

        const payload = normalizeNewsPayload(
          (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );
        const matchingArticles = hydrateFeedArticles(payload.articles);

        if (!isCancelled) {
          setWeatherNewsArticles(matchingArticles.slice(0, 3));
        }
      } catch (error) {
        console.error("Error loading weather news:", error);
        if (!isCancelled) {
          setWeatherNewsArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsWeatherNewsLoading(false);
        }
      }
    }

    void loadWeatherNews();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      weatherFetchController?.abort();
    };
  }, [selectedLocalCity]);

  useEffect(() => {
    let isCancelled = false;

    async function loadTrendingPreviewSections() {
      if (sortMode !== "trending") {
        setBreakingPreviewArticles([]);
        setSportsPreviewArticles([]);
        setCelebrityPreviewArticles([]);
        setTechnologyPreviewArticles([]);
        setBusinessPreviewArticles([]);
        setIsBreakingPreviewLoading(false);
        setIsSportsPreviewLoading(false);
        setIsCelebrityPreviewLoading(false);
        setIsTechnologyPreviewLoading(false);
        setIsBusinessPreviewLoading(false);
        return;
      }

      setIsBreakingPreviewLoading(true);
      setIsSportsPreviewLoading(true);
      setIsCelebrityPreviewLoading(true);
      setIsTechnologyPreviewLoading(true);
      setIsBusinessPreviewLoading(true);

      try {
        const [breakingResponse, sportsResponse, celebrityResponse, technologyResponse, businessResponse] = await Promise.all([
          fetch(
            `/api/news?mode=search&query=${encodeURIComponent(
              BREAKING_NEWS_FEED_QUERY
            )}&pageSize=20`,
            {
              cache: "no-store",
              headers: { Accept: "application/json" },
            }
          ),
          fetch("/api/news?mode=sports&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
          fetch("/api/news?mode=celebrity&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
          fetch("/api/news?mode=technology&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
          fetch("/api/news?mode=business&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
        ]);

        const [breakingPayload, sportsPayload, celebrityPayload, technologyPayload, businessPayload] = await Promise.all([
          breakingResponse.ok ? breakingResponse.json().catch(() => null) : Promise.resolve(null),
          sportsResponse.ok ? sportsResponse.json().catch(() => null) : Promise.resolve(null),
          celebrityResponse.ok
            ? celebrityResponse.json().catch(() => null)
            : Promise.resolve(null),
          technologyResponse.ok
            ? technologyResponse.json().catch(() => null)
            : Promise.resolve(null),
          businessResponse.ok
            ? businessResponse.json().catch(() => null)
            : Promise.resolve(null),
        ]);

        if (isCancelled) {
          return;
        }

        const nextBreakingArticles = breakingPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                breakingPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextSportsArticles = sportsPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                sportsPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextCelebrityArticles = celebrityPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                celebrityPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextTechnologyArticles = technologyPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                technologyPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextBusinessArticles = businessPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                businessPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];

        setBreakingPreviewArticles(nextBreakingArticles);
        setSportsPreviewArticles(nextSportsArticles);
        setCelebrityPreviewArticles(nextCelebrityArticles);
        setTechnologyPreviewArticles(nextTechnologyArticles);
        setBusinessPreviewArticles(nextBusinessArticles);
      } catch (error) {
        console.error("TRENDING SECTION PREVIEW LOAD FAILED", error);
        if (!isCancelled) {
          setBreakingPreviewArticles([]);
          setSportsPreviewArticles([]);
          setCelebrityPreviewArticles([]);
          setTechnologyPreviewArticles([]);
          setBusinessPreviewArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsBreakingPreviewLoading(false);
          setIsSportsPreviewLoading(false);
          setIsCelebrityPreviewLoading(false);
          setIsTechnologyPreviewLoading(false);
          setIsBusinessPreviewLoading(false);
        }
      }
    }

    void loadTrendingPreviewSections();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

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
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId
          ? {
              ...video,
              liked: !video.liked,
              likes: video.liked ? Math.max(0, video.likes - 1) : video.likes + 1,
            }
          : video
      );

    setVideos((prev) => updateVideos(prev));
    setSportsVideos((prev) => updateVideos(prev));
  };

  const handleToggleVideoSave = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      );

    setVideos((prev) => updateVideos(prev));
    setSportsVideos((prev) => updateVideos(prev));
  };

  const applyLocalCitySelection = useCallback((city: string) => {
    const nextConfig = getLocalCityConfigByName(city);
    const nextDisplayName = nextConfig?.displayName ?? city;

    setLocalQueryDraft(city);
    setLocalLocationLabel(nextDisplayName);
    setSelectedLocalCityKey(nextConfig?.cityKey ?? null);
    setLocalQuery(
      nextConfig ? buildLocalNewsQueryText(nextConfig) : buildLocalNewsQuery({ label: city })
    );
    setLocalSearchStatus(null);
    setFeedLoadError(null);
    setWeatherNewsArticles([]);
    if (sortMode === "local") {
      setArticles([]);
      setFeedPage(1);
      setHasMoreArticles(false);
      setIsLocalAreaLoading(true);
    }

    if (userId && nextConfig) {
      const currentCity = savedLocalCity?.trim() ?? "";
      const currentState = savedLocalState?.trim() ?? "";

      if (currentCity !== nextConfig.city || currentState !== nextConfig.state) {
        console.log("SAVING LOCAL CITY", nextConfig.city, nextConfig.state);
        void (async () => {
          const result = await saveProfilePatch(
            {
              id: userId,
              email: userEmail ?? null,
            },
            {
              local_city: nextConfig.city,
              local_state: nextConfig.state,
            }
          );

          if (result.error) {
            console.error("LOCAL CITY SAVE ERROR", result.error);
            return;
          }

          setSavedLocalCity(nextConfig.city);
          setSavedLocalState(nextConfig.state);
        })();
      }
    }
  }, [savedLocalCity, savedLocalState, sortMode, userEmail, userId]);

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

    const frameEntries = Object.entries(trendingVideoFrameRefs.current).filter(
      ([, node]) => Boolean(node)
    );

    if (frameEntries.length === 0) {
      return;
    }

    const visibilityMap = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoKey = (entry.target as HTMLDivElement).dataset.videoKey;

          if (!videoKey) {
            return;
          }

          visibilityMap.set(videoKey, entry.isIntersecting ? entry.intersectionRatio : 0);
        });

        const nextAutoplayKeys = Array.from(visibilityMap.entries())
          .filter(([, ratio]) => ratio >= 0.3)
          .sort((left, right) => right[1] - left[1])
          .map(([videoKey]) => videoKey);

        setAutoplayTrendingVideoKeys(nextAutoplayKeys);
      },
      {
        threshold: [0.16, 0.24, 0.3, 0.45, 0.65],
        rootMargin: "8% 0px -8% 0px",
      }
    );

    frameEntries.forEach(([videoKey, node]) => {
      if (node) {
        visibilityMap.set(videoKey, 0);
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [articles.length, sortMode, videos]);

  useEffect(() => {
    if (sortMode !== "local") {
      return;
    }

    if (selectedLocalCity || localQuery.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const savedCityLabel =
        savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "";
      const nextCityLabel = getLocalCityConfigByName(savedCityLabel)
        ? savedCityLabel
        : DEFAULT_LOCAL_CITY;

      applyLocalCitySelection(nextCityLabel);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    applyLocalCitySelection,
    localQuery,
    savedLocalCity,
    savedLocalState,
    selectedLocalCity,
    sortMode,
  ]);

  useEffect(() => {
    const pendingReturnState = consumePendingArticleReturnState();

    if (!pendingReturnState || pendingReturnState.path !== "/") {
      return;
    }

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (pendingReturnState.sortMode) {
        setSortMode(pendingReturnState.sortMode);
      }

      if (pendingReturnState.sortMode === "local" && pendingReturnState.selectedLocalCity) {
        applyLocalCitySelection(pendingReturnState.selectedLocalCity);
      }

      window.scrollTo({
        top: pendingReturnState.scrollY ?? 0,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrameId);
    };
  }, [applyLocalCitySelection]);

  const handleUpdateLocalQuery = useCallback(async () => {
    const trimmedDraft = localQueryDraft.trim();
    const resolveSupportedCity = (value: string) => {
      const normalizedValue = cleanDisplayText(value).trim().toLowerCase();

      return (
        cityOptions.find(
          (city) => city.displayName.trim().toLowerCase() === normalizedValue
        )?.displayName ?? null
      );
    };

    if (!trimmedDraft) {
      setArticles([]);
      setLocalLocationLabel("");
      setLocalQuery("");
      setLocalSearchStatus("Choose your city to see local stories.");
      setIsLocalAreaLoading(false);
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
          const supportedCity =
            resolveSupportedCity(nextLabel) ??
            resolveSupportedMetroCity({ city, state, label: nextLabel });

          if (supportedCity) {
            applyLocalCitySelection(supportedCity);
            setLocalSearchStatus(null);
            return;
          }

          setLocalSearchStatus("Choose a nearby city.");
          return;
        }
      } catch (error) {
        console.error("Error resolving local zip code:", error);
      }
    }

    const supportedCity = resolveSupportedCity(trimmedDraft);

    if (!supportedCity) {
      setLocalSearchStatus("Choose a supported nearby city.");
      return;
    }

    applyLocalCitySelection(supportedCity);
    setLocalSearchStatus(null);
  }, [applyLocalCitySelection, cityOptions, localQueryDraft]);

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

  const applyArticleUpdateAcrossCollections = useCallback(
    (articleId: number, updater: (article: Article) => Article) => {
      const updateArticles = (items: Article[]) =>
        items.map((article) => (article.id === articleId ? updater(article) : article));

      setArticles((prev) => updateArticles(prev));
      setCategorySectionArticles((prev) => updateArticles(prev));
      setWeatherNewsArticles((prev) => updateArticles(prev));
      setBreakingPreviewArticles((prev) => updateArticles(prev));
      setSportsPreviewArticles((prev) => updateArticles(prev));
      setCelebrityPreviewArticles((prev) => updateArticles(prev));
      setTechnologyPreviewArticles((prev) => updateArticles(prev));
      setBusinessPreviewArticles((prev) => updateArticles(prev));
    },
    []
  );

  const handleLike = async (articleId: number) => {
    if (!userId) {
      alert("Log in to like posts");
      return;
    }

    const currentArticle = [
      ...articles,
      ...categorySectionArticles,
      ...weatherNewsArticles,
      ...breakingPreviewArticles,
      ...sportsPreviewArticles,
      ...celebrityPreviewArticles,
      ...technologyPreviewArticles,
    ].find((article) => article.id === articleId);

    const currentlyLiked = currentArticle?.likedByCurrentUser ?? false;
    const nextLiked = !currentlyLiked;

    applyArticleUpdateAcrossCollections(articleId, (article) => ({
      ...article,
      likes: nextLiked ? article.likes + 1 : Math.max(0, article.likes - 1),
      likeUsers: nextLiked
        ? article.likeUsers.some((likeUser) => likeUser.user_id === userId)
          ? article.likeUsers
          : [
              ...article.likeUsers,
              {
                user_id: userId,
                username,
              },
            ]
        : article.likeUsers.filter((likeUser) => likeUser.user_id !== userId),
      likedByCurrentUser: nextLiked,
    }));

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
        applyArticleUpdateAcrossCollections(articleId, (article) => ({
          ...article,
          likes: article.likes + 1,
          likeUsers: article.likeUsers.some((likeUser) => likeUser.user_id === userId)
            ? article.likeUsers
            : [
                ...article.likeUsers,
                {
                  user_id: userId,
                  username,
                },
              ],
          likedByCurrentUser: true,
        }));
        return;
      }
      return;
    }

    const { error } = await supabase.from("likes").insert({
      article_id: articleId,
      user_id: userId,
    });

    if (error) {
      console.error("Error saving like:", error);
      applyArticleUpdateAcrossCollections(articleId, (article) => ({
        ...article,
        likes: Math.max(0, article.likes - 1),
        likeUsers: article.likeUsers.filter((likeUser) => likeUser.user_id !== userId),
        likedByCurrentUser: false,
      }));
      return;
    }
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

    if (sortMode === "latest") {
      return rankArticlesWithSourcePreferences(copied, {
        mode: "latest",
      });
    }

    if (sortMode === "trending" || sortMode === "sports") {
      return [...copied].sort((leftArticle, rightArticle) => {
        const scoreDifference =
          getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (
          getPublishedAtTimestamp(rightArticle.publishedAt) -
          getPublishedAtTimestamp(leftArticle.publishedAt)
        );
      });
    }

    return copied;
  }, [
    articles,
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

  const handleQuickToggleCategory = async (category: string) => {
    if (!userId) {
      alert("Log in to add categories.");
      return;
    }

    if (isSavingCategories) {
      return;
    }

    const nextCategories = categories.includes(category)
      ? categories.filter((current) => current !== category)
      : [...categories, category];
    const previousCategories = categories;

    setCategories(nextCategories);
    setIsSavingCategories(true);

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
        categories: nextCategories,
        preferred_sources: preferredSources,
        show_less_sources: showLessSources,
      }
    );

    setIsSavingCategories(false);

    if (error) {
      console.error("Error quick-saving categories:", error);
      setCategories(previousCategories);
      alert(error.message ?? "Could not save categories right now.");
      return;
    }
  };

  const balancedLocalArticles = useMemo(() => {
    if (sortMode !== "local") {
      return displayedArticles;
    }

    if (!selectedLocalCity) {
      return [] as Article[];
    }

    const locallyRelevantArticles = [...displayedArticles].filter((article) => {
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
  }, [displayedArticles, localLocationLabel, localQuery, selectedLocalCity, sortMode]);

  const visibleArticles = sortMode === "local" ? balancedLocalArticles : displayedArticles;

  const sportsTabArticles = useMemo(() => {
    const rawSportsArticles =
      sortMode === "sports"
        ? visibleArticles.slice(0, 40)
        : sortMode === "trending"
          ? sportsPreviewArticles.slice(0, 40)
          : ([] as Article[]);

    if (rawSportsArticles.length === 0) {
      return [] as Article[];
    }

    const filteredSportsArticles = rawSportsArticles.filter(
      (article) => !isSportsPromotionalArticle(article)
    );

    if (sortMode === "sports") {
      return selectSourceBalancedArticles(filteredSportsArticles, 25);
    }

    if (sortMode === "trending") {
      return selectSourceBalancedArticles(filteredSportsArticles, 25);
    }

    return [] as Article[];
  }, [sortMode, sportsPreviewArticles, visibleArticles]);

  const celebrityTabArticles = useMemo(() => {
    if (sortMode === "celebrity") {
      return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
    }

    if (sortMode === "trending") {
      return selectSourceBalancedArticles(celebrityPreviewArticles.slice(0, 40), 25);
    }

    return [] as Article[];
  }, [celebrityPreviewArticles, sortMode, visibleArticles]);

  const weatherTabArticles = useMemo(() => {
    if (sortMode !== "weather") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, visibleArticles]);

  const technologyTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(technologyPreviewArticles.slice(0, 40), 25);
    }

    if (sortMode !== "technology") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, technologyPreviewArticles, visibleArticles]);

  const businessTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(businessPreviewArticles.slice(0, 40), 25);
    }

    if (sortMode !== "business") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [businessPreviewArticles, sortMode, visibleArticles]);

  const travelTabArticles = useMemo(() => {
    if (sortMode !== "travel") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, visibleArticles]);

  const foodTabArticles = useMemo(() => {
    if (sortMode !== "food") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, visibleArticles]);

  useEffect(() => {
    if (sortMode === "sports") {
      console.log("SPORTS ARTICLE COUNT", sportsTabArticles.length);
    }
  }, [sortMode, sportsTabArticles.length]);

  useEffect(() => {
    if (sortMode === "local") {
      console.log("LOCAL SELECTED CITY", selectedLocalCity ?? localLocationLabel);
      console.log(
        "LOCAL RESULTS CITY",
        selectedLocalCityKey,
        visibleArticles.map((article) => ({
          title: article.title,
          source: article.source,
        }))
      );
      console.log("LOCAL ARTICLES COUNT", visibleArticles.length);
    }
  }, [localLocationLabel, selectedLocalCity, selectedLocalCityKey, sortMode, visibleArticles]);

  useEffect(() => {
    topTabsRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (sortMode === "trending") {
      topTabsRef.current?.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [sortMode]);

  const localCitySuggestions = useMemo(() => {
    if (sortMode !== "local") {
      return [] as string[];
    }

    const normalizedDraft = cleanDisplayText(localQueryDraft).trim().toLowerCase();

    if (normalizedDraft.length === 0) {
      return cityOptions.map((city) => city.displayName);
    }

    const startsWithMatches = cityOptions
      .map((city) => city.displayName)
      .filter((city) => city.toLowerCase().startsWith(normalizedDraft));

    const includesMatches = cityOptions
      .map((city) => city.displayName)
      .filter(
        (city) =>
          !startsWithMatches.includes(city) && city.toLowerCase().includes(normalizedDraft)
      );

    return [...startsWithMatches, ...includesMatches];
  }, [cityOptions, localQueryDraft, sortMode]);

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

  const myNewsVideoPool = useMemo(() => {
    const playableVideos = videos.filter((video) => !video.fallback && !isSportsVideo(video));
    const preferredVertical = playableVideos.filter(
      (video) =>
        video.orientation === "vertical" ||
        /shorts?|reels?|vertical|portrait/i.test(
          `${video.title} ${video.watchUrl} ${video.thumbnailUrl ?? ""}`
        )
    );

    const preferredPool = preferredVertical.length > 0 ? preferredVertical : playableVideos;
    return selectSourceBalancedVideos(preferredPool, 24);
  }, [videos]);

  const myNewsQuickWatchVideos = useMemo(
    () => myNewsVideoPool.slice(0, 5),
    [myNewsVideoPool]
  );
  const myNewsFeaturedVideos = useMemo(
    () =>
      myNewsVideoPool.slice(
        myNewsQuickWatchVideos.length,
        myNewsQuickWatchVideos.length + 8
      ),
    [myNewsQuickWatchVideos.length, myNewsVideoPool]
  );
  const primaryNewsClipVideos = useMemo(
    () =>
      myNewsVideoPool.slice(
        myNewsQuickWatchVideos.length + myNewsFeaturedVideos.length,
        myNewsQuickWatchVideos.length + myNewsFeaturedVideos.length + 5
      ),
    [myNewsQuickWatchVideos.length, myNewsFeaturedVideos.length, myNewsVideoPool]
  );

  const topTenTrendingArticles = useMemo(
    () => balancedTrendingArticles.slice(0, 10),
    [balancedTrendingArticles]
  );

  const breakingNewsPreviewArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [];
    }

    const topTrendingKeys = new Set(
      topTenTrendingArticles.map((article) => getArticleDeduplicationKey(article))
    );

    const trustedBreakingArticles = breakingPreviewArticles.filter((article) =>
      BREAKING_NEWS_TRUSTED_SOURCES.some((source) =>
        getSafeSourceLabel(article.source).toLowerCase().includes(source.toLowerCase())
      )
    );

    const candidateArticles =
      trustedBreakingArticles.length > 0 ? trustedBreakingArticles : breakingPreviewArticles;

    return candidateArticles
      .filter((article) => !topTrendingKeys.has(getArticleDeduplicationKey(article)))
      .sort((leftArticle, rightArticle) => {
        const leftTime = leftArticle.publishedAt
          ? new Date(leftArticle.publishedAt).getTime()
          : 0;
        const rightTime = rightArticle.publishedAt
          ? new Date(rightArticle.publishedAt).getTime()
          : 0;
        return rightTime - leftTime;
      })
      .slice(0, 5);
  }, [breakingPreviewArticles, sortMode, topTenTrendingArticles]);

  const myNewsFeaturedArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    const usedKeys = new Set(
      [
        ...breakingNewsPreviewArticles,
        ...topTenTrendingArticles,
      ].map((article) => getArticleDeduplicationKey(article))
    );

    const primaryFeaturedArticles = balancedTrendingArticles
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        const image = getBestArticleImage(article);
        return Boolean(image.src) && isLikelyHighQualityArticleImage(image.source, image.src);
      })
      .slice(0, 12);

    if (primaryFeaturedArticles.length >= 8) {
      return primaryFeaturedArticles;
    }

    primaryFeaturedArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    const fallbackArticles = balancedTrendingArticles
      .concat(visibleArticles)
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        return isRenderableArticleRecord(article);
      })
      .sort(
        (leftArticle, rightArticle) =>
          getPublishedAtTimestamp(rightArticle.publishedAt) -
          getPublishedAtTimestamp(leftArticle.publishedAt)
      )
      .slice(0, Math.max(0, 12 - primaryFeaturedArticles.length));

    return [...primaryFeaturedArticles, ...fallbackArticles].slice(0, 12);
  }, [
    balancedTrendingArticles,
    breakingNewsPreviewArticles,
    sortMode,
    topTenTrendingArticles,
    visibleArticles,
  ]);

  const sportsVideoPool = useMemo(
    () =>
      selectSourceBalancedVideos(
        [...sportsVideos, ...videos]
          .filter((video) => {
            if (video.fallback) {
              return false;
            }

            return isSportsVideo(video);
          })
          .sort((left, right) => {
            const scoreVideo = (video: VideoItem) => {
              const haystack = `${video.title} ${video.creator} ${video.category}`.toLowerCase();
              let score = 0;

              if (/(highlights|top plays|goals?|dunk|touchdown|home run|save|replay|buzzer beater|walk off|game winner|slam dunk)/.test(haystack)) {
                score += 140;
              }

              if (/(sportscenter|espn highlights|nfl highlights|nba highlights|mlb highlights|nhl highlights|mls highlights|soccer goals|cbs sports highlights|bleacher report highlights|fox sports highlights|formula 1 highlights|f1 highlights)/.test(haystack)) {
                score += 130;
              }

              if (/(espn|sportscenter|cbs sports|fox sports|nbc sports|bleacher report|sports illustrated|mlb|nfl|nba|nhl|mls|golf|nascar|formula 1|formula1|f1)/.test(haystack)) {
                score += 70;
              }

              if (video.orientation === "vertical") {
                score += 56;
              }

              if (/(debate|podcast|interview|reaction|preview|rumors)/.test(haystack)) {
                score -= 130;
              }

              return score;
            };

            return scoreVideo(right) - scoreVideo(left);
          }),
        16
      ),
    [sportsVideos, videos]
  );

  const sportsStandardArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    return sportsTabArticles;
  }, [sortMode, sportsTabArticles]);

  const sportsFeaturedArticle = useMemo(() => {
    if (sortMode !== "sports") {
      return null;
    }

    return sportsTabArticles[0] ?? null;
  }, [sortMode, sportsTabArticles]);

  const sportsFeedArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    if (!sportsFeaturedArticle) {
      return sportsStandardArticles;
    }

    const featuredKey = getArticleDeduplicationKey(sportsFeaturedArticle);
    return sportsStandardArticles.filter(
      (article) => getArticleDeduplicationKey(article) !== featuredKey
    );
  }, [sortMode, sportsFeaturedArticle, sportsStandardArticles]);

  const sportsQuickWatchVideos = useMemo(() => sportsVideoPool.slice(0, 8), [sportsVideoPool]);

  const sportsFeaturedVideo = useMemo(
    () => sportsVideoPool[8] ?? sportsVideoPool[0] ?? null,
    [sportsVideoPool]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(favoriteTeamsStorageKey);
      const parsedValue = rawValue
        ? (JSON.parse(rawValue) as
            | FavoriteTeamOption[]
            | Array<{
                league?: string;
                teamName?: string;
                teamId?: string;
                logo?: string | null;
              }>)
        : [];
      const validTeamIds = new Set(
        TEAM_PICKER_LEAGUES.flatMap((league) =>
          FAVORITE_TEAMS_BY_LEAGUE[league].map((team) => team.team_id)
        )
      );

      setFavoriteTeams(
        parsedValue
          .map((team) => {
            if ("team_id" in team && team.team_id) {
              return team as FavoriteTeamOption;
            }

            if (!("teamId" in team) || !("teamName" in team)) {
              return null;
            }

            const league = TEAM_PICKER_LEAGUES.find(
              (candidate) => candidate === (team.league as FavoriteLeagueKey)
            );

            if (!league || !team.teamId || !team.teamName) {
              return null;
            }

            return {
              team_id: team.teamId,
              team_name: team.teamName,
              league,
              logo_url: team.logo ?? null,
            } satisfies FavoriteTeamOption;
          })
          .filter(
            (team): team is FavoriteTeamOption =>
              team !== null && Boolean(team.team_id) && validTeamIds.has(team.team_id)
          )
      );
    } catch (error) {
      console.error("FAVORITE TEAMS LOAD FAILED", error);
      setFavoriteTeams([]);
    } finally {
      setHasLoadedFavoriteTeams(true);
    }
  }, [favoriteTeamsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedFavoriteTeams) {
      return;
    }

    try {
      window.localStorage.setItem(
        favoriteTeamsStorageKey,
        JSON.stringify(
          favoriteTeams.map((team) => ({
            league: team.league,
            teamName: team.team_name,
            teamId: team.team_id,
            logo: team.logo_url,
          }))
        )
      );
    } catch (error) {
      console.error("FAVORITE TEAMS SAVE FAILED", error);
    }
  }, [favoriteTeams, favoriteTeamsStorageKey, hasLoadedFavoriteTeams]);

  const favoriteTeamUpdates = useMemo<FavoriteTeamUpdate[]>(() => {
    return favoriteTeams.map((team) => {
      const normalizedTeamName = team.team_name.toLowerCase();
      const article =
        sportsTabArticles.find((candidate) => {
          const haystack = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
          return haystack.includes(normalizedTeamName);
        }) ?? null;

      return {
        team,
        article,
      };
    });
  }, [favoriteTeams, sportsTabArticles]);

  const prioritizedSportsScores = useMemo(() => {
    const selectedGames = sportsScoresByLeague[activeScoresLeague] ?? [];

    if (selectedGames.length === 0) {
      return [];
    }

    const favoriteNames = new Set(
      favoriteTeams
        .filter((team) => team.league === activeScoresLeague)
        .map((team) => team.team_name.toLowerCase())
    );

    return [...selectedGames].sort((left, right) => {
      const leftFavoriteScore =
        Number(favoriteNames.has(left.homeTeam.name.toLowerCase())) +
        Number(favoriteNames.has(left.awayTeam.name.toLowerCase()));
      const rightFavoriteScore =
        Number(favoriteNames.has(right.homeTeam.name.toLowerCase())) +
        Number(favoriteNames.has(right.awayTeam.name.toLowerCase()));

      if (rightFavoriteScore !== leftFavoriteScore) {
        return rightFavoriteScore - leftFavoriteScore;
      }

      const leftPriority =
        (left.status === "Live" ? 3 : left.status === "Today" ? 2 : left.status === "Upcoming" ? 1 : 0);
      const rightPriority =
        (right.status === "Live" ? 3 : right.status === "Today" ? 2 : right.status === "Upcoming" ? 1 : 0);

      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }

      const rightTime = right.scheduledAt ? new Date(right.scheduledAt).getTime() : 0;
      const leftTime = left.scheduledAt ? new Date(left.scheduledAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [activeScoresLeague, favoriteTeams, sportsScoresByLeague]);

  const myNewsImageCount = useMemo(() => {
    const sampleArticles = [
      ...breakingNewsPreviewArticles,
      ...topTenTrendingArticles,
      ...myNewsFeaturedArticles,
    ];

    return sampleArticles.filter((article) => {
      const sourceName = getSafeSourceLabel(article.source);
      const image = getBestArticleImage(article);
      return (
        (Boolean(image.src) && isLikelyHighQualityArticleImage(image.source, image.src)) ||
        hasMappedSourceLogo(sourceName)
      );
    }).length;
  }, [breakingNewsPreviewArticles, myNewsFeaturedArticles, topTenTrendingArticles]);

  const sportsImageCount = useMemo(
    () =>
      sportsTabArticles.filter((article) => {
        const sourceName = getSafeSourceLabel(article.source);
        const image = getBestArticleImage(article);
        return (
          (Boolean(image.src) && isLikelyHighQualityArticleImage(image.source, image.src)) ||
          hasMappedSourceLogo(sourceName)
        );
      }).length,
    [sportsTabArticles]
  );

  useEffect(() => {
    if (sortMode === "trending") {
      console.log("MY NEWS FEATURED ARTICLES COUNT", myNewsFeaturedArticles.length);
      console.log("MY NEWS FEATURED VIDEOS COUNT", myNewsFeaturedVideos.length);
      console.log("MY NEWS IMAGE COUNT", myNewsImageCount);
    }

    if (sortMode === "sports") {
      console.log("SPORTS VIDEO COUNT", sportsVideoPool.length);
      console.log("SPORTS INSERT QUICK WATCH AFTER INDEX 3");
      console.log("SPORTS INSERT FEATURED VIDEO AFTER INDEX 6");
      console.log("SPORTS QUICK WATCH COUNT", sportsQuickWatchVideos.length);
      console.log("SPORTS FEATURED VIDEO EXISTS", Boolean(sportsFeaturedVideo));
      console.log("SPORTS IMAGE COUNT", sportsImageCount);
    }
  }, [
    myNewsImageCount,
    myNewsFeaturedArticles.length,
    myNewsFeaturedVideos.length,
    sportsImageCount,
    sportsVideoPool.length,
    sortMode,
    sportsFeaturedVideo,
    sportsQuickWatchVideos.length,
  ]);

  const topPollsSection = useMemo(
    () =>
      [...myFeedPolls]
        .sort((left, right) => {
          const scoreDifference = getPollFeedScore(right) - getPollFeedScore(left);

          if (scoreDifference !== 0) {
            return scoreDifference;
          }

          return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
        })
        .slice(0, 3),
    [myFeedPolls]
  );

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const topLocalStories = useMemo(() => {
    if (sortMode !== "local" || !selectedLocalCity) {
      return [];
    }

    return balancedLocalArticles.slice(0, 6);
  }, [balancedLocalArticles, selectedLocalCity, sortMode]);

  const navigableTopLocalStories = useMemo(
    () => topLocalStories.filter((article) => getArticleRouteId(article) !== null),
    [topLocalStories]
  );

  const myFeedRenderItems = useMemo(() => {
    if (sortMode !== "polls") {
      return [];
    }

    const sortedPolls = [...myFeedPolls]
      .filter((poll) =>
        pollFilter === "following" ? pollFollowingIds.includes(poll.user_id) : true
      )
      .sort((left, right) => {
        if (pollFilter === "trending") {
          return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
        }

        if (pollFilter === "following") {
          const rightRecent = getPublishedAtTimestamp(right.created_at);
          const leftRecent = getPublishedAtTimestamp(left.created_at);

          if (rightRecent !== leftRecent) {
            return rightRecent - leftRecent;
          }
        }

        const scoreDifference = getPollFeedScore(right) - getPollFeedScore(left);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
      });

    return sortedPolls.map((poll) => ({
      type: "poll" as const,
      key: `poll:${poll.id}`,
      poll,
    }));
  }, [myFeedPolls, pollFilter, pollFollowingIds, sortMode]);

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
      const articleRouteId = getArticleRouteId(article);

      if (!articleRouteId || !isRenderableArticleRecord(article)) {
        return null;
      }

      const safeSourceName = getSafeSourceLabel(article.source);
      const safeCategoryName = getSafeCategoryLabel(article.category, article);
      const selectedImage = getBestArticleImage(article);
      const imageSrc = selectedImage.src;
      const hasSourceLogoFallback = hasMappedSourceLogo(safeSourceName);
      const imageFailureKey = imageSrc ? `${article.id}:${imageSrc}` : `${article.id}:none`;
      const shouldUseLargeImage =
        Boolean(imageSrc) &&
        !failedArticleImages[imageFailureKey] &&
        isLikelyHighQualityArticleImage(selectedImage.source, imageSrc);
      const publishedLabel = options?.showFreshnessTime
        ? formatFreshnessTime(article.publishedAt, article.time)
        : formatPublishedDate(article.publishedAt, article.time);

      const visualBoxNode = shouldUseLargeImage ? (
        <div className="article-thumb-shell article-card-visual-shell" aria-hidden="true">
          <img
            src={imageSrc as string}
            alt={cleanDisplayText(article.title)}
            className="article-thumb-image article-card-visual-image"
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
      ) : hasSourceLogoFallback ? (
        <div
          className="article-thumb-shell article-card-visual-shell article-card-visual-placeholder"
          aria-hidden="true"
        >
          <div className="article-card-visual-content">
            <span className="article-card-visual-brand">
              <SourceBadge sourceName={safeSourceName} showInitialFallback={false} />
            </span>
            <span className="article-card-visual-label">{safeSourceName}</span>
          </div>
        </div>
      ) : (
        <div
          className={`article-thumb-shell article-card-visual-shell article-card-category-placeholder article-card-category-placeholder-${safeCategoryName.toLowerCase()}`}
          aria-hidden="true"
        >
          <div className="article-card-visual-content">
            <span className="article-card-category-chip">{getCategoryLabel(safeCategoryName)}</span>
          </div>
        </div>
      );

      return (
        <article
          className={`news-card ${options?.rankLabel ? "news-card-has-rank" : ""}`}
        >
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              {sortMode === "local" ? (
                <div className="trending-source-brand trending-source-brand-static">
                  <SourceBadge sourceName={safeSourceName} />
                  <span className="trending-source-name">{safeSourceName}</span>
                  <span className="trending-source-category-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="trending-source-category-inline">
                    {getCategoryLabel(safeCategoryName)}
                  </span>
                </div>
              ) : (
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
                    <span className="trending-source-category-separator" aria-hidden="true">
                      ·
                    </span>
                    <span className="trending-source-category-inline">
                      {getCategoryLabel(safeCategoryName)}
                    </span>
                  </div>
                </Link>
              )}
            </div>
            <div className="trending-card-top-meta">
              {options?.rankLabel ? (
                <span className="chip trending-rank-badge news-card-rank-badge">
                  {options.rankLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={`/article/${articleRouteId}/`}
            className="article-link"
            onClick={() => {
              persistArticleMetadata(article);
              saveArticleReturnState({
                path: "/",
                scrollY: window.scrollY,
                source: "home",
                sortMode,
                selectedLocalCity,
                localLocationLabel,
              });
            }}
          >
            <div className="news-card-body news-card-body-with-thumb news-card-body-compact">
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
              </div>
              {visualBoxNode}
            </div>
          </Link>
          <div className="news-card-footer">
            <span className="trending-published-date news-card-footer-date">{publishedLabel}</span>
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

  const renderQuickWatchRow = (compact = false) => {
    if (myNewsQuickWatchVideos.length === 0) {
      return null;
    }

    return (
      <section
        className={`home-section-block home-section-plain quick-watch-row ${
          compact ? "quick-watch-row-compact" : ""
        }`.trim()}
      >
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Quick Watch</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="Quick watch videos">
          {myNewsQuickWatchVideos.map((video) => (
            <div
              key={video.id}
              className={`quick-watch-item ${compact ? "quick-watch-item-compact" : ""}`.trim()}
              role="listitem"
            >
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`quickwatch:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`quickwatch:${video.id}`] = node;
                }}
                autoplayKey={`quickwatch:${video.id}`}
                previewDurationMs={compact ? null : 4000}
                label="Quick Watch"
                hideActions
                useRelativeTime
                className={`video-card-inline quick-watch-video-card ${
                  compact ? "quick-watch-video-card-compact" : ""
                }`.trim()}
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedStoriesRow = () => {
    if (myNewsFeaturedArticles.length === 0) {
      return null;
    }

    const usedImageSources = new Set<string>();

    return (
      <section className="home-section-block home-section-plain featured-stories-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Featured Articles</strong>
          </div>
        </div>
        <div className="featured-stories-scroll" role="list" aria-label="Featured articles">
          {myNewsFeaturedArticles.map((article) => {
            const routeId = getArticleRouteId(article);
            const selectedImage = getBestArticleImage(article);
            const imageSrc =
              selectedImage.src && !usedImageSources.has(selectedImage.src)
                ? selectedImage.src
                : null;

            if (imageSrc) {
              usedImageSources.add(imageSrc);
            }

            if (!routeId) {
              return null;
            }

            return (
              <Link
                key={`featured-${routeId}`}
                href={`/article/${routeId}/`}
                className="featured-story-card"
                role="listitem"
                onClick={() => {
                  persistArticleMetadata(article);
                  saveArticleReturnState({
                    path: "/",
                    scrollY: window.scrollY,
                    source: "home",
                    sortMode,
                    selectedLocalCity,
                    localLocationLabel,
                  });
                }}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={cleanDisplayText(article.title)}
                    className="featured-story-image"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="featured-story-fallback-brand" aria-hidden="true">
                    <SourceBadge sourceName={getSafeSourceLabel(article.source)} />
                  </div>
                )}
                <div className={`featured-story-overlay ${imageSrc ? "" : "featured-story-overlay-solid"}`} />
                <div className="featured-story-copy">
                  <span className="featured-story-source">{getSafeSourceLabel(article.source)}</span>
                  <h3 className="featured-story-title">{cleanDisplayText(article.title)}</h3>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  const renderNewsClipsRow = () => {
    if (primaryNewsClipVideos.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">News Clips</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="News clips">
          {primaryNewsClipVideos.map((video) => (
            <div key={`news-clips-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`news-clips:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`news-clips:${video.id}`] = node;
                }}
                autoplayKey={`news-clips:${video.id}`}
                previewDurationMs={4000}
                label="News Clip"
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedVideosBreak = () => {
    if (myNewsFeaturedVideos.length === 0) {
      return null;
    }

    if (myNewsFeaturedVideos.length < 3) {
      const video = myNewsFeaturedVideos[0];

      if (!video) {
        return null;
      }

      return (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Featured Video</strong>
            </div>
          </div>
          <div className="stack home-section-list">
            <div>
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`featured-videos:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`featured-videos:${video.id}`] = node;
                }}
                autoplayKey={`featured-videos:${video.id}`}
                previewDurationMs={4000}
                label="Featured Video"
                className="video-card-inline featured-video-single-card"
                variant="article"
              />
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Featured Videos</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="Featured videos">
          {myNewsFeaturedVideos.map((video) => (
            <div key={`featured-videos-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`featured-videos:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`featured-videos:${video.id}`] = node;
                }}
                autoplayKey={`featured-videos:${video.id}`}
                previewDurationMs={4000}
                label="Featured Video"
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderWeatherConditionIcon = (condition: string | null | undefined) => {
    const icon = getWeatherConditionIconLabel(condition);

    if (icon === "sun") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.55 5.45l-1.7 1.7M7.15 16.85l-1.7 1.7M18.55 18.55l-1.7-1.7M7.15 7.15l-1.7-1.7" />
        </svg>
      );
    }

    if (icon === "rain") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 18.2a4.2 4.2 0 1 1 .7-8.35A5.7 5.7 0 0 1 18.5 11a3.4 3.4 0 0 1-.3 6.8H7Z" />
          <path d="M8.5 19.3 7.4 21M12.1 19.3 11 21M15.7 19.3 14.6 21" />
        </svg>
      );
    }

    if (icon === "snow") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 17.8a4.1 4.1 0 1 1 .65-8.15A5.6 5.6 0 0 1 18.4 10.8a3.3 3.3 0 0 1-.25 6.6H7Z" />
          <path d="M9 19.2h0M12 20.4h0M15 19.2h0" />
        </svg>
      );
    }

    if (icon === "storm") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 17.7a4.1 4.1 0 1 1 .65-8.15A5.6 5.6 0 0 1 18.45 10.7a3.3 3.3 0 0 1-.25 6.6H7Z" />
          <path d="m11.2 18.1-1.1 2.5 2.15-.2-1.2 2.8 3.1-4.3-2.2.15 1.15-1.95" />
        </svg>
      );
    }

    if (icon === "wind") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M3 9.2h11.5a2.3 2.3 0 1 0-2.3-2.3" />
          <path d="M3 13.2h15.7a2.1 2.1 0 1 1-2.1 2.1" />
          <path d="M3 17.2h9.8a1.9 1.9 0 1 0-1.9 1.9" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
        <path d="M7.2 18.2a4.2 4.2 0 1 1 .7-8.35A5.7 5.7 0 0 1 18.7 11a3.5 3.5 0 0 1-.3 7.1H7.2Z" />
      </svg>
    );
  };

  const getFavoriteTeamInitials = (teamName: string) =>
    teamName
      .split(/\s+/)
      .filter((word) => !["fc", "cf", "sc", "city"].includes(word.toLowerCase()))
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");

  const handleToggleFavoriteTeam = (team: FavoriteTeamOption) => {
    if (!userId) {
      alert("Log in to save favorite teams.");
      return;
    }

    setFavoriteTeams((current) => {
      const alreadyFollowed = current.some((savedTeam) => savedTeam.team_id === team.team_id);

      if (alreadyFollowed) {
        return current.filter((savedTeam) => savedTeam.team_id !== team.team_id);
      }

      return [...current, team];
    });
  };

  const handleTeamLeagueSelect = (league: FavoriteLeagueKey) => {
    setActiveTeamLeague(league);

    const leagueIndex = TEAM_PICKER_LEAGUES.indexOf(league);
    const node = teamPickerPagesRef.current;

    if (!node || leagueIndex < 0) {
      return;
    }

    node.scrollTo({
      left: node.clientWidth * leagueIndex,
      behavior: "smooth",
    });
  };

  const renderFavoriteTeamBadge = (team: FavoriteTeamOption) => (
    <span className="favorite-team-logo-shell" aria-hidden="true">
      {team.logo_url ? (
        <img
          src={team.logo_url}
          alt={team.team_name}
          className="favorite-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : null}
      <span className="favorite-team-logo-fallback">{getFavoriteTeamInitials(team.team_name)}</span>
    </span>
  );

  const renderScoreTeamMark = (
    team: { name: string; logoUrl: string | null },
    className = ""
  ) => (
    <span className={`sports-score-team-mark ${className}`.trim()} aria-hidden="true">
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="sports-score-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="sports-score-team-fallback">{getFavoriteTeamInitials(team.name)}</span>
    </span>
  );

  const renderTeamPickerModal = () => {
    if (!isTeamPickerOpen) {
      return null;
    }

    return (
      <div
        className="favorite-teams-page-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-teams-picker-title"
      >
        <div className="favorite-teams-page">
          <div className="favorite-teams-page-header">
            <button
              type="button"
              className="favorite-teams-close"
              onClick={() => setIsTeamPickerOpen(false)}
              aria-label="Close favorite teams"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <h3 id="favorite-teams-picker-title" className="favorite-teams-page-title">
              Favorite Teams
            </h3>
            <span className="favorite-teams-header-spacer" aria-hidden="true" />
          </div>

          <div className="favorite-teams-tabs" role="tablist" aria-label="Favorite team leagues">
            {TEAM_PICKER_LEAGUES.map((league) => (
              <button
                key={league}
                type="button"
                role="tab"
                aria-selected={activeTeamLeague === league}
                className={`favorite-teams-tab ${
                  activeTeamLeague === league ? "favorite-teams-tab-active" : ""
                }`}
                onClick={() => handleTeamLeagueSelect(league)}
              >
                {league}
              </button>
            ))}
          </div>

          <div
            ref={teamPickerPagesRef}
            className="favorite-teams-pages"
            onScroll={(event) => {
              const target = event.currentTarget;
              const pageWidth = target.clientWidth || 1;
              const nextIndex = Math.round(target.scrollLeft / pageWidth);
              const nextLeague = TEAM_PICKER_LEAGUES[nextIndex];

              if (nextLeague && nextLeague !== activeTeamLeague) {
                setActiveTeamLeague(nextLeague);
              }
            }}
          >
            {TEAM_PICKER_LEAGUES.map((league) => (
              <section
                key={league}
                className="favorite-teams-page-panel"
                role="tabpanel"
                aria-label={`${league} teams`}
              >
                <div className="favorite-teams-grid">
                  {FAVORITE_TEAMS_BY_LEAGUE[league].map((team) => {
                    const isSelected = favoriteTeams.some(
                      (savedTeam) => savedTeam.team_id === team.team_id
                    );

                    return (
                      <button
                        key={team.team_id}
                        type="button"
                        className={`favorite-team-card ${
                          isSelected ? "favorite-team-card-selected" : ""
                        }`}
                        onClick={() => handleToggleFavoriteTeam(team)}
                      >
                        {renderFavoriteTeamBadge(team)}
                        <span className="favorite-team-name">{team.team_name}</span>
                        <span className="favorite-team-meta">
                          {isSelected ? "Selected" : "Tap to follow"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTopTrendingListItem = (article: Article, rank: number) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const selectedImage = getBestArticleImage(article);
    const shouldUseImage =
      Boolean(selectedImage.src) &&
      isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);

    return (
      <article className="top-trending-list-card">
        <Link
          href={`/article/${articleRouteId}/`}
          className="top-trending-list-link"
          onClick={() => {
            persistArticleMetadata(article);
            saveArticleReturnState({
              path: "/",
              scrollY: window.scrollY,
              source: "home",
              sortMode,
              selectedLocalCity,
              localLocationLabel,
            });
          }}
        >
          <div className="top-trending-list-rank" aria-hidden="true">
            {rank}
          </div>
          <div className="top-trending-list-copy">
            <div className="top-trending-list-meta">
              <span className="top-trending-list-source">{safeSourceName}</span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
            </div>
            <h3 className="top-trending-list-title">{cleanDisplayText(article.title)}</h3>
          </div>
          <div className="top-trending-list-media" aria-hidden="true">
            {shouldUseImage && selectedImage.src ? (
              <img
                src={selectedImage.src}
                alt={cleanDisplayText(article.title)}
                className="top-trending-list-image"
                loading="lazy"
                decoding="async"
              />
            ) : hasMappedSourceLogo(safeSourceName) ? (
              <div className="top-trending-list-logo-fallback">
                <SourceBadge sourceName={safeSourceName} showInitialFallback={false} />
              </div>
            ) : null}
          </div>
        </Link>
      </article>
    );
  };

  const renderCompactSideImageArticle = (
    article: Article,
    options?: {
      showRank?: number | null;
      imageFallbackLabel?: string | null;
      className?: string;
    }
  ) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const selectedImage = getBestArticleImage(article);
    const shouldUseImage =
      Boolean(selectedImage.src) &&
      isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);

    return (
      <article
        className={`top-trending-list-card ${
          typeof options?.showRank === "number" ? "top-trending-list-card-ranked" : ""
        } ${options?.className ?? ""}`.trim()}
      >
        <Link
          href={`/article/${articleRouteId}/`}
          className="top-trending-list-link"
          onClick={() => {
            persistArticleMetadata(article);
            saveArticleReturnState({
              path: "/",
              scrollY: window.scrollY,
              source: "home",
              sortMode,
              selectedLocalCity,
              localLocationLabel,
            });
          }}
        >
          {typeof options?.showRank === "number" ? (
            <div className="top-trending-list-rank" aria-hidden="true">
              {options.showRank}
            </div>
          ) : null}
          <div className="top-trending-list-copy">
            <div className="top-trending-list-meta">
              <span className="top-trending-list-source">{safeSourceName}</span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
            </div>
            <h3 className="top-trending-list-title">{cleanDisplayText(article.title)}</h3>
          </div>
          <div className="top-trending-list-media" aria-hidden="true">
            {shouldUseImage && selectedImage.src ? (
              <img
                src={selectedImage.src}
                alt={cleanDisplayText(article.title)}
                className="top-trending-list-image"
                loading="lazy"
                decoding="async"
              />
            ) : hasMappedSourceLogo(safeSourceName) ? (
              <div className="top-trending-list-logo-fallback">
                <SourceBadge sourceName={safeSourceName} showInitialFallback={false} />
                {options?.imageFallbackLabel ? (
                  <span className="top-trending-list-fallback-label">{options.imageFallbackLabel}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Link>
      </article>
    );
  };

  const renderHomeTopNavigation = (
    activeMode:
      | "trending"
      | "local"
      | "sports"
      | "celebrity"
      | "weather"
      | "technology"
      | "travel"
      | "food"
      | "business"
  ) => (
    <div ref={topTabsRef} className="trending-tabs-wrap home-sections-nav">
      <div className="toolbar toolbar-centered">
        <button
          className={`toolbar-pill ${activeMode === "trending" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("trending")}
        >
          My News
        </button>
        <button
          className={`toolbar-pill ${activeMode === "local" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("local")}
        >
          Local
        </button>
        <button
          className={`toolbar-pill ${activeMode === "sports" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("sports")}
        >
          Sports
        </button>
        <button
          className={`toolbar-pill ${activeMode === "celebrity" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("celebrity")}
        >
          Celebrity
        </button>
        <button
          className={`toolbar-pill ${activeMode === "weather" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("weather")}
        >
          Weather
        </button>
        <button
          className={`toolbar-pill ${activeMode === "technology" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("technology")}
        >
          Technology
        </button>
        <button
          className={`toolbar-pill ${activeMode === "travel" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("travel")}
        >
          Travel
        </button>
        <button
          className={`toolbar-pill ${activeMode === "food" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("food")}
        >
          Food
        </button>
        <button
          className={`toolbar-pill ${activeMode === "business" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("business")}
        >
          Business
        </button>
      </div>
    </div>
  );

  if (
    (sortMode === "trending" ||
      sortMode === "local" ||
      sortMode === "sports" ||
      sortMode === "celebrity" ||
      sortMode === "weather" ||
      sortMode === "technology" ||
      sortMode === "travel" ||
      sortMode === "food" ||
      sortMode === "business") &&
    isInitialFeedLoading &&
    visibleArticles.length === 0 &&
    !feedLoadError
  ) {
    console.log(
      "REMOVED IN-APP LOADING SCREEN FROM:",
      "/Users/erniewilson/my-news-app/app/page.tsx"
    );
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation(
          sortMode === "local"
            ? "local"
            : sortMode === "sports"
              ? "sports"
              : sortMode === "celebrity"
                ? "celebrity"
                : sortMode === "weather"
                  ? "weather"
                  : sortMode === "technology"
                    ? "technology"
                    : sortMode === "travel"
                      ? "travel"
                      : sortMode === "food"
                        ? "food"
                        : sortMode === "business"
                          ? "business"
                        : "trending"
        )}
        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">
                {sortMode === "local"
                  ? "Local"
                  : sortMode === "sports"
                    ? "Sports"
                    : sortMode === "celebrity"
                      ? "Celebrity"
                      : sortMode === "weather"
                        ? "Weather"
                        : sortMode === "technology"
                          ? "Technology"
                          : sortMode === "travel"
                            ? "Travel"
                            : sortMode === "food"
                              ? "Food"
                              : sortMode === "business"
                                ? "Business"
                              : "Top 10 Trending"}
              </strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>
          <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-screen-inline">
              <span className="loading-screen-spinner" aria-hidden="true" />
              <span className="loading-screen-text">Loading stories...</span>
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ height: "190px", borderRadius: "24px" }} />
              <div className="skeleton-line" style={{ height: "18px", width: "72%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "92%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "84%" }} />
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ height: "18px", width: "68%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "90%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "80%" }} />
            </div>
          </div>
        </section>
      </section>
    );
  }

  if (sortMode === "trending") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("trending")}

        {renderQuickWatchRow(true)}

        {breakingNewsPreviewArticles.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title breaking-news-title">
                  Breaking News
                </strong>
                <span className="home-section-date">{todayLabel}</span>
              </div>
            </div>
            <div className="stack home-section-list">
              {breakingNewsPreviewArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {renderFeaturedStoriesRow()}
        {renderNewsClipsRow()}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Trending Top 10</strong>
            </div>
          </div>
          <div className="stack home-section-list top-trending-card-rail top-trending-list-rail">
            {topTenTrendingArticles.map((article, index) => (
              <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                {renderCompactSideImageArticle(article, { showRank: index + 1 })}
              </div>
            ))}
          </div>
        </section>

        <section id="my-news-section" className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">My News</strong>
            </div>
          </div>

          {!userId ? (
            <div className="empty-state compact-empty-state">
              <strong>Log in to personalize My News</strong>
              <span>Follow categories and sources to build your own feed here.</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="stack" style={{ gap: "12px" }}>
              <div className="category-grid">
                {CATEGORY_OPTIONS.slice(0, 8).map((category) => (
                  <button
                    key={category}
                    className="category-pill"
                    onClick={() => {
                      setCategoryDraft([category]);
                      setCategorySheetStatus(null);
                      setIsCategorySheetOpen(true);
                    }}
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))}
              </div>
            </div>
          ) : isCategorySectionLoading ? (
            <div className="muted">Loading category stories...</div>
          ) : categorySectionArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No category stories yet</strong>
              <span>Try updating your interests or check back shortly.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {categorySectionArticles.slice(0, 6).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
              <span className="muted">Forecast and weather-related stories for your selected city.</span>
            </div>
          </div>

          <div className="stack local-feed-shell">
            <div className="home-weather-card">
              <div className="stack" style={{ gap: "4px" }}>
                <span className="home-weather-city">{selectedLocalCity ?? localLocationLabel}</span>
                <div className="home-weather-temp-row">
                  <span className="home-weather-icon-shell">
                    {renderWeatherConditionIcon(weatherCard?.weatherLabel)}
                  </span>
                  <strong className="home-weather-temp">
                    {weatherCard ? `${Math.round(weatherCard.temperature)}°` : "—"}
                  </strong>
                </div>
                <span className="muted">
                  {weatherCard ? weatherCard.weatherLabel : isWeatherLoading ? "Loading forecast..." : "Forecast unavailable"}
                </span>
              </div>
              <div className="stack home-weather-meta" style={{ gap: "6px" }}>
                <span className="muted">
                  {weatherCard?.windMph ? `Wind ${Math.round(weatherCard.windMph)} mph` : "Local outlook"}
                </span>
              </div>
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
                          applyLocalCitySelection(city);
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

            {isWeatherNewsLoading ? <p className="settings-detail-note">Loading weather stories...</p> : null}

            {weatherNewsArticles.length === 0 && !isWeatherNewsLoading ? (
              <div className="empty-state compact-empty-state">
                <strong>No weather stories for {selectedLocalCity ?? "this city"} right now.</strong>
                <span>Try another supported city or check back shortly.</span>
              </div>
            ) : (
              <div className="stack home-section-list top-trending-card-rail weather-story-list">
                {weatherNewsArticles.slice(0, 3).map((article) => (
                  <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                    {renderCompactSideImageArticle(article, {
                      className: "weather-compact-card",
                      imageFallbackLabel: "Weather",
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Polls</strong>
              <span className="muted">Top questions people are reacting to right now.</span>
            </div>
          </div>

          {topPollsSection.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No polls yet</strong>
              <span>Create the first one from the plus button.</span>
            </div>
          ) : (
            <div className="polls-carousel" role="list" aria-label="Top polls">
              {topPollsSection.map((poll, index) => (
                <div key={poll.id} className="polls-carousel-item" role="listitem">
                  <PollCard
                    poll={poll}
                    onVote={handleVoteOnPoll}
                    isVoting={activePollVoteId === poll.id}
                    rankLabel={formatTopRankLabel(index + 1)}
                    className="poll-card-featured"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Featured Profiles</strong>
              <span className="muted">Popular source profiles to explore right now.</span>
            </div>
          </div>

          {homeSourceRankings.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No featured profiles yet</strong>
              <span>Check back shortly as more sources gain momentum.</span>
            </div>
          ) : (
            <div className="source-rankings-carousel" role="list" aria-label="Featured profiles">
              {homeSourceRankings.slice(0, 8).map((source) => (
                <Link
                  key={`featured-profile-${source.sourceName}`}
                  href={`/source/${slugifySourceName(source.sourceName)}/`}
                  className="source-rankings-card featured-profile-card"
                  role="listitem"
                >
                  <div className="source-rankings-card-art-shell">
                    <SourceBadge sourceName={source.sourceName} className="source-rankings-card-art" />
                  </div>
                  <div className="source-rankings-card-copy">
                    <span className="source-rankings-name">{source.sourceName}</span>
                    <span className="source-rankings-card-meta">News Source</span>
                  </div>
                  <div className="featured-profile-card-stats">
                    <span>{source.likes} hearts</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Sports</strong>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setSortMode("sports")}
            >
              More
            </button>
          </div>

          {sportsTabArticles.length === 0 ? (
            isSportsPreviewLoading ? (
              <div className="muted">Loading sports stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No sports stories yet</strong>
                <span>Check back shortly for fresh sports coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list">
              {sportsTabArticles.slice(0, 6).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Add Categories</strong>
              <span className="muted">Swipe through topics to shape your feed.</span>
            </div>
            {userId ? (
              <Link href="/profile/categories/" className="button button-secondary">
                Edit all
              </Link>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => alert("Log in to customize categories.")}
              >
                Log in
              </button>
            )}
          </div>

          <div className="category-swipe-row" role="list" aria-label="Browse categories">
            {CATEGORY_OPTIONS.slice(0, 16).map((category, index) => {
              const isSelected = categories.includes(category);
              const label = getCategoryLabel(category);

              return (
                <button
                  key={category}
                  type="button"
                  role="listitem"
                  className={`category-swipe-card ${
                    isSelected ? "category-swipe-card-active" : ""
                  }`}
                  onClick={() => void handleQuickToggleCategory(category)}
                  disabled={isSavingCategories}
                >
                  <span
                    className={`category-swipe-card-art category-art-${index % 8} ${
                      isSelected ? "category-swipe-card-art-active" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span className="category-swipe-card-label">{label}</span>
                  <span className="category-swipe-card-meta">
                    {isSelected ? "Added" : userId ? "Tap to add" : "Log in to add"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Technology</strong>
            </div>
          </div>

          {technologyTabArticles.length === 0 ? (
            isTechnologyPreviewLoading ? (
              <div className="muted">Loading technology stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No technology stories yet</strong>
                <span>Check back shortly for fresh technology coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list">
              {technologyTabArticles.slice(0, 6).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>

        {renderFeaturedVideosBreak()}

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Business</strong>
            </div>
          </div>

          {businessTabArticles.length === 0 ? (
            isBusinessPreviewLoading ? (
              <div className="muted">Loading business stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No business stories yet</strong>
                <span>Check back shortly for fresh business and finance coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list">
              {businessTabArticles.slice(0, 6).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Source Rankings</strong>
              <span className="muted">News companies people are hearting right now.</span>
            </div>
            <Link href="/source-rankings/" className="button button-secondary">
              See all
            </Link>
          </div>

          {isHomeSourceRankingsLoading ? (
            <div className="muted">Loading source rankings...</div>
          ) : homeSourceRankings.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No source hearts yet</strong>
              <span>Heart a source from Search or its profile to build the rankings.</span>
            </div>
          ) : (
            <div className="source-rankings-carousel" role="list" aria-label="Source rankings">
              {homeSourceRankings.map((source, index) => (
                <Link
                  key={source.sourceName}
                  href={`/source/${slugifySourceName(source.sourceName)}/`}
                  className="source-rankings-card"
                  role="listitem"
                >
                  <div className="source-rankings-card-art-shell">
                    <SourceBadge sourceName={source.sourceName} className="source-rankings-card-art" />
                    <span className="source-rankings-rank">#{index + 1}</span>
                  </div>
                  <div className="source-rankings-card-copy">
                    <span className="source-rankings-name">{source.sourceName}</span>
                    <span className="source-rankings-card-meta">News Source</span>
                  </div>
                  <div className="source-rankings-card-actions">
                    <button
                      type="button"
                      className={`icon-action-pill icon-action-pill-icon-only ${
                        source.heartedByCurrentUser ? "icon-action-pill-active" : ""
                      }`}
                      aria-label={
                        userId ? `Open ${source.sourceName} source profile` : "Log in to heart sources"
                      }
                      onClick={(event) => handlePromptSourceHeart(event, source.sourceName)}
                    >
                      <span className="icon-action-glyph" aria-hidden="true">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill={source.heartedByCurrentUser ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m12 20.5-1.3-1.2C5.2 14.3 2 11.4 2 7.8 2 5.1 4.2 3 6.9 3c1.5 0 3 .7 4.1 1.9C12.1 3.7 13.6 3 15.1 3 17.8 3 20 5.1 20 7.8c0 3.6-3.2 6.5-8.7 11.5L12 20.5Z" />
                        </svg>
                      </span>
                    </button>
                    <strong>{source.likes}</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {renderNewsClipsRow()}

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
      </section>
    );
  }

  if (sortMode === "sports") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("sports")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Sports</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {sportsTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No sports stories yet</strong>
              <span>Check back shortly for fresh sports coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Your Teams</strong>
                    <span className="muted">Follow your favorite teams for updates.</span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setIsTeamPickerOpen(true)}
                  >
                    Add Teams
                  </button>
                </div>

                {favoriteTeamUpdates.length === 0 ? (
                  <div className="empty-state compact-empty-state">
                    <strong>Follow your favorite teams for updates.</strong>
                    <span>Team alerts and game-day updates will appear here once favorites are enabled.</span>
                  </div>
                ) : (
                  <div className="favorite-team-updates-row" role="list" aria-label="Favorite team updates">
                    {favoriteTeamUpdates.map(({ team, article }) => (
                      <article
                        key={`favorite-team-update-${team.team_id}`}
                        className="favorite-team-update-card"
                        role="listitem"
                      >
                        <div className="favorite-team-update-top">
                          {renderFavoriteTeamBadge(team)}
                          <div className="favorite-team-update-copy">
                            <strong>{team.team_name}</strong>
                            <span>{team.league} Team</span>
                          </div>
                        </div>
                        <p className="favorite-team-update-headline">
                          {article
                            ? cleanDisplayText(article.title)
                            : "Latest team news and live game updates will appear here once the sports API is connected."}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Scores</strong>
                    <span className="muted">Live, upcoming, and recent games.</span>
                  </div>
                </div>

                <div className="favorite-teams-tabs sports-scores-tabs" role="tablist" aria-label="Sports score leagues">
                  {(["NFL", "NBA", "MLB", "NHL", "MLS"] as SportsScoreLeague[]).map((league) => (
                    <button
                      key={`scores-${league}`}
                      type="button"
                      role="tab"
                      aria-selected={activeScoresLeague === league}
                      className={`favorite-teams-tab ${
                        activeScoresLeague === league ? "favorite-teams-tab-active" : ""
                      }`}
                      onClick={() => setActiveScoresLeague(league)}
                    >
                      {league}
                    </button>
                  ))}
                </div>

                {isSportsScoresLoading ? (
                  <div className="muted">Loading scores...</div>
                ) : prioritizedSportsScores.length === 0 ? (
                  <div className="empty-state compact-empty-state">
                    <strong>No scores loaded right now.</strong>
                    <span>Recent and upcoming games will appear here as soon as the score feeds respond.</span>
                  </div>
                ) : (
                  <div className="sports-scores-scroll" role="list" aria-label={`${activeScoresLeague} scores`}>
                    {prioritizedSportsScores.map((game) => (
                      <article
                        key={game.id}
                        className="sports-score-card"
                        role="listitem"
                      >
                        <div className="sports-score-card-top">
                          <span className="sports-score-league">{game.league}</span>
                          <span className={`sports-score-status sports-score-status-${game.status.toLowerCase()}`}>
                            {game.status}
                          </span>
                        </div>
                        <div className="sports-score-team-row">
                          <div className="sports-score-team-copy">
                            {renderScoreTeamMark(game.awayTeam)}
                            <span className="sports-score-team-name">{game.awayTeam.name}</span>
                          </div>
                          <strong className="sports-score-points">{game.awayTeam.score ?? "—"}</strong>
                        </div>
                        <div className="sports-score-team-row">
                          <div className="sports-score-team-copy">
                            {renderScoreTeamMark(game.homeTeam)}
                            <span className="sports-score-team-name">{game.homeTeam.name}</span>
                          </div>
                          <strong className="sports-score-points">{game.homeTeam.score ?? "—"}</strong>
                        </div>
                        <div className="sports-score-meta">
                          <span>{game.shortDetail ?? "Upcoming game"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {sportsFeaturedArticle ? (
                <section className="home-section-block home-section-plain featured-stories-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Featured Article</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list">
                    <div>
                      {renderArticleFeedCard(sportsFeaturedArticle)}
                    </div>
                  </div>
                </section>
              ) : null}

              {sportsFeedArticles.slice(0, 3).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}

              {sportsQuickWatchVideos.length > 0 ? (
                <section className="home-section-block home-section-plain quick-watch-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Sports Quick Watch</strong>
                    </div>
                  </div>
                  <div className="quick-watch-scroll" role="list" aria-label="Sports quick watch videos">
                    {sportsQuickWatchVideos.slice(0, 6).map((video) => (
                      <div key={video.id} className="quick-watch-item" role="listitem">
                        <VideoFeedCard
                          video={video}
                          isAutoplaying={
                            autoplayTrendingVideoKeys.includes(`sports-quickwatch:${video.id}`) &&
                            !video.fallback
                          }
                          onToggleLike={handleToggleVideoLike}
                          onToggleSave={handleToggleVideoSave}
                          onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                          onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                        frameRef={(node) => {
                          trendingVideoFrameRefs.current[`sports-quickwatch:${video.id}`] = node;
                        }}
                        autoplayKey={`sports-quickwatch:${video.id}`}
                        previewDurationMs={null}
                        label="Quick Watch"
                        hideActions
                        useRelativeTime
                        className="video-card-inline quick-watch-video-card"
                        variant="article"
                      />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {sportsFeedArticles.slice(3, 6).map((article) => (
                <div key={`sports-mid-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}

              {sportsFeaturedVideo ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Featured Sports Video</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list">
                    <div>
                      <VideoFeedCard
                        video={sportsFeaturedVideo}
                        isAutoplaying={
                          autoplayTrendingVideoKeys.includes(`sports-featured-video:${sportsFeaturedVideo.id}`) &&
                          !sportsFeaturedVideo.fallback
                        }
                        onToggleLike={handleToggleVideoLike}
                        onToggleSave={handleToggleVideoSave}
                        onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                        onOpenPlayer={(videoId) => router.push(`/video/${videoId}/`)}
                        frameRef={(node) => {
                          trendingVideoFrameRefs.current[`sports-featured-video:${sportsFeaturedVideo.id}`] = node;
                        }}
                        autoplayKey={`sports-featured-video:${sportsFeaturedVideo.id}`}
                        previewDurationMs={null}
                        label="Featured Sports Video"
                        className="video-card-inline featured-video-single-card"
                        variant="article"
                      />
                    </div>
                  </div>
                </section>
              ) : null}

              {sportsFeedArticles.slice(6).map((article) => (
                <div key={`sports-rest-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
        {renderTeamPickerModal()}
      </section>
    );
  }

  if (sortMode === "celebrity") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("celebrity")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Celebrity</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {celebrityTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No celebrity stories yet</strong>
              <span>Check back shortly for fresh entertainment coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {celebrityTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "weather") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("weather")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {weatherTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No weather stories yet</strong>
              <span>Check back shortly for fresh weather coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {weatherTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "technology") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("technology")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Technology</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {technologyTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No technology stories yet</strong>
              <span>Check back shortly for fresh tech coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {technologyTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "travel") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("travel")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Travel</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {travelTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No travel stories yet</strong>
              <span>Check back shortly for fresh travel coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {travelTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "food") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("food")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Food</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {foodTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No food stories yet</strong>
              <span>Check back shortly for fresh food coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {foodTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "business") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("business")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Business</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {businessTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No business stories yet</strong>
              <span>Check back shortly for fresh business and finance coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {businessTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "local") {
    const localCityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const localEmptyLabel = localCityLabel.split(",")[0]?.trim() || "Charlotte";

    return (
      <section className="page-shell home-sections-shell local-page-shell">
        {renderHomeTopNavigation("local")}

        <section className="home-section-block home-section-plain local-page-hero">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Local</strong>
            </div>
          </div>

          <div className="section-card stack local-feed-shell local-search-card">
            <div className="local-feed-top-row">
              <span className="local-feed-selected-label">{localCityLabel}</span>
            </div>
            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Search supported cities"
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
                    aria-label="Suggested local cities"
                  >
                    {localCitySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className={`local-city-dropdown-item ${
                          localCityLabel === city ? "local-city-dropdown-item-active" : ""
                        }`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyLocalCitySelection(city);
                          setIsLocalAutocompleteOpen(false);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {isLocalAreaLoading && navigableTopLocalStories.length === 0 ? (
              <div className="search-inline-loading local-inline-loading" role="status" aria-live="polite">
                Loading local stories...
              </div>
            ) : null}
          </div>
        </section>

        <section className="section-card home-section-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
            </div>
          </div>

          <div className="home-weather-card">
            <div className="stack" style={{ gap: "4px" }}>
              <span className="home-weather-city">{localCityLabel}</span>
              <div className="home-weather-temp-row">
                <span className="home-weather-icon-shell">
                  {renderWeatherConditionIcon(weatherCard?.weatherLabel)}
                </span>
                <strong className="home-weather-temp">
                  {weatherCard ? `${Math.round(weatherCard.temperature)}°` : "—"}
                </strong>
              </div>
              <span className="muted">
                {weatherCard
                  ? weatherCard.weatherLabel
                  : isWeatherLoading
                  ? "Loading forecast..."
                  : "Forecast unavailable"}
              </span>
            </div>
            <div className="stack home-weather-meta" style={{ gap: "6px" }}>
              <span className="muted">
                {weatherCard?.windMph ? `Wind ${Math.round(weatherCard.windMph)} mph` : "Local outlook"}
              </span>
            </div>
          </div>
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Top Local Stories</strong>
            </div>
          </div>

          {isLocalAreaLoading && navigableTopLocalStories.length === 0 ? (
            <div className="muted local-inline-placeholder">Updating stories...</div>
          ) : navigableTopLocalStories.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No {localEmptyLabel} stories found yet.</strong>
            </div>
          ) : (
            <div className="stack home-section-list">
              {navigableTopLocalStories.map((article) => {
                const articleKey =
                  article.id || article.url || getArticleDeduplicationKey(article);
                return (
                  <div key={articleKey}>
                    {renderArticleFeedCard(article)}
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="page-hero">
        <div className="page-title-row">
          <div className="trending-tabs-wrap">
            <div className="toolbar toolbar-centered">
              <button
                className="toolbar-pill"
                onClick={() => setSortMode("trending")}
              >
                Trending
              </button>
              <button
                className={`toolbar-pill ${
                  sortMode === "polls" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setSortMode("polls")}
              >
                Polls
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

      {sortMode === "polls" ? (
        <div className="polls-filter-toolbar">
          <label className="polls-filter-select-wrap">
            <span className="polls-filter-select-label">Filter</span>
            <select
              className="polls-filter-select"
              value={pollFilter}
              onChange={(event) =>
                setPollFilter(event.target.value as "top" | "following" | "trending")
              }
              aria-label="Poll feed filter"
            >
              <option value="top">Top Polls</option>
              <option value="following">Following</option>
              <option value="trending">Trending</option>
            </select>
          </label>
        </div>
      ) : null}

      {sortMode === "polls" && myFeedRenderItems.length === 0 ? (
        <div className="empty-state">
          <strong>{pollFilter === "following" ? "No followed-user polls yet" : "No polls yet"}</strong>
          <span>
            {pollFilter === "following"
              ? "Follow more people or create your own poll."
              : "Create the first one."}
          </span>
        </div>
      ) : visibleArticles.length === 0 &&
        !(sortMode === "polls" && myFeedRenderItems.length > 0) ? (
        <div className="empty-state">
          <strong>
            {feedLoadError
              ? "Couldn’t load stories."
              : sortMode === "polls"
              ? "No polls yet"
              : "No stories yet"}
          </strong>
          <span>
            {feedLoadError
              ? "Tap to retry."
              : sortMode === "polls"
              ? "Create the first one."
              : "Check back in a moment for fresh stories."}
          </span>
        </div>
      ) : (
        <div className="stack feed-results-stack">
          {feedLoadError ? (
            <div className="feed-inline-error" role="status" aria-live="polite">
              <div className="stack" style={{ gap: "10px" }}>
                <span>{feedLoadError}</span>
              </div>
            </div>
          ) : null}
          {sortMode === "polls"
            ? myFeedRenderItems.map((item) => (
                <div key={item.key} className="stack">
                  <PollCard
                    poll={item.poll}
                    onVote={handleVoteOnPoll}
                    isVoting={activePollVoteId === item.poll.id}
                  />
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
