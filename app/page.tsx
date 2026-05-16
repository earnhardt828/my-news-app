"use client";

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
  consumePendingArticleReturnState,
  saveArticleReturnState,
} from "../lib/article-navigation";
import {
  applyPollVoteUpdate,
  getPollFeedScore,
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
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";

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

const LOCAL_CITY_SUGGESTIONS = [
  "Chicago, IL",
  "Los Angeles, CA",
  "New York, NY",
  "Atlanta, GA",
  "Houston, TX",
  "Miami, FL",
  "Charlotte, NC",
  "Cincinnati, OH",
  "Dallas, TX",
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
      "Los Angeles local news LA Times KTLA ABC7 Los Angeles NBC Los Angeles CBS Los Angeles LAist FOX 11 Los Angeles Spectrum News 1 SoCal",
    sources: [
      "LA Times",
      "Los Angeles Times",
      "KTLA",
      "ABC7 Los Angeles",
      "NBC Los Angeles",
      "CBS Los Angeles",
      "LAist",
      "FOX 11 Los Angeles",
      "Spectrum News 1 SoCal",
    ],
    signals: ["los angeles", "la county", "hollywood", "pasadena", "santa monica", "socal", "southern california"],
  },
  "New York, NY": {
    query:
      "New York local news NY1 Gothamist New York Daily News NBC New York CBS New York ABC7NY PIX11 The City NYC AMNY",
    sources: [
      "NY1",
      "Gothamist",
      "New York Daily News",
      "NBC New York",
      "CBS New York",
      "ABC7NY",
      "PIX11",
      "The City NYC",
      "AMNY",
    ],
    signals: [
      "new york",
      "nyc",
      "manhattan",
      "brooklyn",
      "queens",
      "bronx",
      "staten island",
      "harlem",
      "long island city",
    ],
  },
  "Atlanta, GA": {
    query: "Atlanta local news AJC WSB-TV FOX 5 Atlanta 11Alive Atlanta News First",
    sources: ["AJC", "WSB-TV", "FOX 5 Atlanta", "11Alive", "Atlanta News First"],
    signals: ["atlanta", "georgia", "fulton county", "buckhead", "decatur"],
  },
  "Houston, TX": {
    query: "Houston local news Houston Chronicle KHOU ABC13 Houston FOX 26 Houston KPRC 2",
    sources: ["Houston Chronicle", "KHOU", "ABC13 Houston", "FOX 26 Houston", "KPRC 2", "KPRC"],
    signals: ["houston", "texas", "harris county", "katy", "sugar land"],
  },
  "Miami, FL": {
    query: "Miami local news Miami Herald WSVN NBC 6 South Florida CBS Miami Local 10",
    sources: ["Miami Herald", "WSVN", "NBC 6 South Florida", "CBS Miami", "Local 10"],
    signals: ["miami", "south florida", "dade", "miami-dade", "fort lauderdale"],
  },
  "Charlotte, NC": {
    query:
      "Charlotte local news WSOC Charlotte WBTV Charlotte WCNC Charlotte Queen City News WFAE Charlotte Axios Charlotte Charlotte Observer WCCB Charlotte",
    sources: [
      "Charlotte Observer",
      "WSOC-TV",
      "WSOC Charlotte",
      "WBTV",
      "WCNC",
      "Queen City News",
      "WFAE",
      "Axios Charlotte",
      "WCCB Charlotte",
    ],
    signals: ["charlotte", "mecklenburg", "queen city", "gastonia", "rock hill", "fort mill"],
  },
  "Cincinnati, OH": {
    query: "Cincinnati local news Cincinnati Enquirer WCPO WLWT FOX19",
    sources: ["Cincinnati Enquirer", "WCPO", "WLWT", "FOX19"],
    signals: ["cincinnati", "ohio", "hamilton county", "covington", "newport"],
  },
  "Dallas, TX": {
    query:
      "Dallas local news Dallas Morning News WFAA NBC 5 Dallas-Fort Worth CBS News Texas FOX 4 Dallas",
    sources: [
      "Dallas Morning News",
      "WFAA",
      "NBC 5 Dallas-Fort Worth",
      "CBS News Texas",
      "FOX 4 Dallas",
    ],
    signals: ["dallas", "fort worth", "dfw", "north texas", "plano", "arlington", "frisco"],
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
    query:
      "San Francisco local news San Francisco Chronicle KQED ABC7 Bay Area NBC Bay Area CBS News Bay Area KRON4",
    sources: [
      "SF Chronicle",
      "San Francisco Chronicle",
      "KQED",
      "ABC7 Bay Area",
      "NBC Bay Area",
      "CBS News Bay Area",
      "KRON4",
    ],
    signals: ["san francisco", "bay area", "oakland", "san jose", "berkeley"],
  },
  "Philadelphia, PA": {
    query: "Philadelphia local news Philadelphia Inquirer 6ABC NBC10 Philadelphia CBS Philadelphia WHYY",
    sources: ["Philadelphia Inquirer", "6ABC", "NBC10 Philadelphia", "CBS Philadelphia", "WHYY"],
    signals: ["philadelphia", "pennsylvania", "philly", "camden", "delaware county"],
  },
} as const;

const LOCAL_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "Chicago, IL": { latitude: 41.8781, longitude: -87.6298 },
  "Los Angeles, CA": { latitude: 34.0522, longitude: -118.2437 },
  "New York, NY": { latitude: 40.7128, longitude: -74.006 },
  "Atlanta, GA": { latitude: 33.749, longitude: -84.388 },
  "Houston, TX": { latitude: 29.7604, longitude: -95.3698 },
  "Miami, FL": { latitude: 25.7617, longitude: -80.1918 },
  "Charlotte, NC": { latitude: 35.2271, longitude: -80.8431 },
  "Cincinnati, OH": { latitude: 39.1031, longitude: -84.512 },
  "Dallas, TX": { latitude: 32.7767, longitude: -96.797 },
  "Detroit, MI": { latitude: 42.3314, longitude: -83.0458 },
  "Minneapolis, MN": { latitude: 44.9778, longitude: -93.265 },
  "Phoenix, AZ": { latitude: 33.4484, longitude: -112.074 },
  "San Francisco, CA": { latitude: 37.7749, longitude: -122.4194 },
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
  { city: "San Francisco, CA", states: ["california"], tokens: ["san francisco", "oakland", "berkeley", "marin", "bay area"] },
  { city: "New York, NY", states: ["new york", "new jersey", "connecticut"], tokens: ["new york", "nyc", "brooklyn", "queens", "bronx", "manhattan", "jersey city"] },
  { city: "Atlanta, GA", states: ["georgia"], tokens: ["atlanta", "fulton county", "buckhead", "decatur"] },
  { city: "Dallas, TX", states: ["texas"], tokens: ["dallas", "fort worth", "dfw", "north texas", "plano", "arlington", "frisco"] },
  { city: "Houston, TX", states: ["texas"], tokens: ["houston", "harris county", "sugar land"] },
  { city: "Miami, FL", states: ["florida"], tokens: ["miami", "broward", "south florida", "fort lauderdale"] },
  { city: "Cincinnati, OH", states: ["ohio", "kentucky"], tokens: ["cincinnati", "hamilton county", "northern kentucky"] },
  { city: "Detroit, MI", states: ["michigan"], tokens: ["detroit", "wayne county", "dearborn"] },
  { city: "Minneapolis, MN", states: ["minnesota"], tokens: ["minneapolis", "saint paul", "st paul", "twin cities"] },
  { city: "Phoenix, AZ", states: ["arizona"], tokens: ["phoenix", "mesa", "tempe", "scottsdale"] },
  { city: "Philadelphia, PA", states: ["pennsylvania", "delaware", "new jersey"], tokens: ["philadelphia", "philly", "camden", "delco"] },
];

function getFeedCacheKey(
  mode: "trending" | "latest" | "polls" | "local",
  localLabel: string
) {
  return mode === "local"
    ? `graffiti:last-feed:${mode}:${normalizeLookupValue(localLabel) || "regional"}`
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

function getDistanceBetweenCoords(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const startLatitude = toRadians(left.latitude);
  const endLatitude = toRadians(right.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function getNearestSupportedMetroByCoords(
  latitude: number,
  longitude: number
): SupportedLocalCity {
  return (Object.entries(LOCAL_CITY_COORDINATES) as Array<
    [SupportedLocalCity, { latitude: number; longitude: number }]
  >).reduce<{
    city: SupportedLocalCity;
    distance: number;
  }>(
    (closest, [city, coords]) => {
      const distance = getDistanceBetweenCoords(
        { latitude, longitude },
        coords
      );

      if (distance < closest.distance) {
        return {
          city,
          distance,
        };
      }

      return closest;
    },
    {
      city: "Charlotte, NC",
      distance: Number.POSITIVE_INFINITY,
    }
  ).city;
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
  const [sortMode, setSortMode] = useState<"trending" | "polls" | "latest" | "local">(
    "trending"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
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
  const [pollFilter, setPollFilter] = useState<"top" | "following" | "trending">("top");
  const [pollFollowingIds, setPollFollowingIds] = useState<string[]>([]);
  const [activePollVoteId, setActivePollVoteId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
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
  const [localLocationLabel, setLocalLocationLabel] = useState("Regional news");
  const [isLocalAutocompleteOpen, setIsLocalAutocompleteOpen] = useState(false);
  const [localSearchStatus, setLocalSearchStatus] = useState<string | null>(null);
  const [isLocalAreaLoading, setIsLocalAreaLoading] = useState(false);
  const [categorySectionArticles, setCategorySectionArticles] = useState<Article[]>([]);
  const [isCategorySectionLoading, setIsCategorySectionLoading] = useState(false);
  const [homeSourceRankings, setHomeSourceRankings] = useState<RankedSourceSummary[]>([]);
  const [isHomeSourceRankingsLoading, setIsHomeSourceRankingsLoading] = useState(false);
  const [weatherCard, setWeatherCard] = useState<WeatherCardData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherNewsArticles, setWeatherNewsArticles] = useState<Article[]>([]);
  const [isWeatherNewsLoading, setIsWeatherNewsLoading] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const trendingVideoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("FOUND LOADING ARTICLES COMPONENT");
      console.log("CURRENT ROUTE", window.location.pathname);
    }
    console.log("TRENDING LOADING STATE", isLoading);
    console.log("ARTICLES COUNT", articles.length);
    console.log("LOADING STATE", isLoading);
  }, [articles.length, isLoading]);


  const feedMode: "trending" | "latest" | "local" | "polls" = useMemo(() => {
    if (sortMode === "latest") {
      return "latest";
    }

    if (sortMode === "polls") {
      return "polls";
    }

    if (sortMode === "local") {
      return "local";
    }

    return "trending";
  }, [sortMode]);

  const categoryReloadKey = "__ignore-categories__";
  const isMyFeedWithoutCategories = false;
  const selectedLocalCity = useMemo(
    () =>
      resolveSupportedMetroCity({
        label: localLocationLabel,
        city: localQueryDraft,
      }),
    [localLocationLabel, localQueryDraft]
  );
  const localEmptyStateHeadline = useMemo(() => {
    const cityLabel = selectedLocalCity ?? localLocationLabel;
    const cityName = cleanDisplayText(cityLabel).split(",")[0]?.trim();
    return cityName
      ? `No local stories found for ${cityName} yet.`
      : "No local stories found for this city yet.";
  }, [localLocationLabel, selectedLocalCity]);

  const loadFeedPage = useCallback(async (pageToLoad: number, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;
    const requestId = activeFeedRequestIdRef.current + 1;
    const feedCacheKey = getFeedCacheKey(feedMode, localLocationLabel);
    const cachedFeed = replace ? readCachedFeedPayload(feedCacheKey) : null;
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
            timeoutMs: INITIAL_FEED_TIMEOUT_MS,
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
      }

      let newsPath = "";
      let newsPayload: PaginatedNewsResponse | null = null;

      if (feedMode === "local") {
        if (!selectedLocalCity && !localQuery.trim()) {
          setIsLocalAreaLoading(false);
          return;
        }

        const activeLocalCity = selectedLocalCity ?? resolveSupportedMetroCity({
          label: localLocationLabel,
        });
        const cityConfig = activeLocalCity ? LOCAL_CITY_CONFIGS[activeLocalCity] : null;
        const localSearchQuery =
          cityConfig?.query ??
          buildLocalNewsQuery({ label: activeLocalCity ?? localLocationLabel });
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

        newsPath = `/api/news?${params.toString()}`;
      }

      {
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
        if (nextArticles.length > 0) {
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
  }, [feedMode, localEmptyStateHeadline, localLocationLabel, localQuery, selectedLocalCity, sortMode]);

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

        const normalizedVideos = normalizeVideoFeedItems(data.videos)
          .filter((video) => !video.fallback)
          .sort((left, right) => {
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
        setVideos(normalizedVideos);
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos([]);
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

  useEffect(() => {
    if (!selectedLocalCity) {
      return;
    }

    const city = selectedLocalCity;
    let isCancelled = false;

    async function loadWeatherCard() {
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
        console.error("Error loading weather card:", error);
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
    if (!selectedLocalCity) {
      return;
    }

    const city = selectedLocalCity;
    let isCancelled = false;

    async function loadWeatherNews() {
      setIsWeatherNewsLoading(true);

      try {
        const weatherQuery = `${city} weather forecast storm heat rain climate`;
        const response = await apiFetch(
          `/api/news?mode=search&query=${encodeURIComponent(weatherQuery)}&page=1&pageSize=6`
        );

        if (!response.ok) {
          throw new Error(`Weather news request failed (${response.status})`);
        }

        const payload = normalizeNewsPayload(
          (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );
        const cityTerms = normalizeLookupValue(city)
          .split(/[\s,]+/)
          .filter((term) => term.length > 1);
        const weatherTerms = ["weather", "forecast", "storm", "rain", "snow", "heat", "wind"];

        const matchingArticles = hydrateFeedArticles(payload.articles).filter((article) => {
          const haystack = normalizeLookupValue(
            `${article.title} ${article.description ?? ""} ${article.source ?? ""}`
          );

          return (
            cityTerms.some((term) => haystack.includes(term)) &&
            weatherTerms.some((term) => haystack.includes(term))
          );
        });

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
    };
  }, [selectedLocalCity]);

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

  const applyLocalCitySelection = useCallback((city: string) => {
    setLocalQueryDraft(city);
    setLocalLocationLabel(city);
    setLocalQuery(buildLocalNewsQuery({ label: city }));
    setLocalSearchStatus(null);
    setFeedLoadError(null);
    if (sortMode === "local") {
      setArticles([]);
      setFeedPage(1);
      setHasMoreArticles(false);
      setIsLocalAreaLoading(true);
    }
  }, [sortMode]);

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

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const fallbackTimeoutId = window.setTimeout(() => {
        setLocalSearchStatus("Location unavailable. Choose a nearby city.");
      }, 0);

      return () => {
        window.clearTimeout(fallbackTimeoutId);
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearestMetro = getNearestSupportedMetroByCoords(
          position.coords.latitude,
          position.coords.longitude
        );
        applyLocalCitySelection(nearestMetro);
        setLocalSearchStatus(`Showing news for ${nearestMetro}.`);
      },
      () => {
        setLocalSearchStatus("Location denied. Choose a nearby city.");
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000,
      }
    );
  }, [applyLocalCitySelection, localQuery, selectedLocalCity, sortMode]);

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
        LOCAL_CITY_SUGGESTIONS.find(
          (city) => city.trim().toLowerCase() === normalizedValue
        ) ?? null
      );
    };

    if (!trimmedDraft) {
      applyLocalCitySelection("Charlotte, NC");
      setLocalSearchStatus("Choose a nearby city.");
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
      setLocalSearchStatus("Choose a nearby city.");
      return;
    }

    applyLocalCitySelection(supportedCity);
    setLocalSearchStatus(null);
  }, [applyLocalCitySelection, localQueryDraft]);

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

    if (sortMode === "latest") {
      return rankArticlesWithSourcePreferences(copied, {
        mode: "latest",
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

  useEffect(() => {
    if (sortMode === "local") {
      console.log("LOCAL SELECTED CITY", selectedLocalCity ?? localLocationLabel);
      console.log("LOCAL ARTICLES COUNT", visibleArticles.length);
    }
  }, [localLocationLabel, selectedLocalCity, sortMode, visibleArticles.length]);

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

  const quickWatchVideos = useMemo(
    () =>
      selectSourceBalancedVideos(
        videos.filter((video) => !video.fallback && video.orientation === "vertical"),
        8
      ),
    [videos]
  );

  const topTenTrendingArticles = useMemo(
    () => balancedTrendingArticles.slice(0, 10),
    [balancedTrendingArticles]
  );

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

  const sportsSectionArticles = useMemo(
    () =>
      articles
        .filter((article) => {
          const category = getCategoryLabel(getSafeCategoryLabel(article.category, article));
          const source = cleanDisplayText(article.source).toLowerCase();
          const titleAndDescription = cleanDisplayText(
            `${article.title} ${article.description ?? ""}`
          ).toLowerCase();

          return (
            category === "Sports" ||
            [
              "espn",
              "sports illustrated",
              "si.com",
              "cbs sports",
              "nbc sports",
              "fox sports",
              "bleacher report",
              "the athletic",
            ].some((name) => source.includes(name)) ||
            ["game", "playoff", "season", "league", "team", "final", "coach", "draft"].some(
              (term) => titleAndDescription.includes(term)
            )
          );
        })
        .slice(0, 8),
    [articles]
  );

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const localCategorySections = useMemo(() => {
    if (sortMode !== "local") {
      return [];
    }

    const categoryDefinitions = [
      {
        key: "crime",
        label: "Crime",
        matcher: (article: Article) => {
          const haystack = normalizeLookupValue(
            `${article.title} ${article.description ?? ""} ${article.category ?? ""}`
          );
          return ["crime", "police", "shooting", "arrest", "suspect", "officer", "court"].some(
            (term) => haystack.includes(term)
          );
        },
      },
      {
        key: "development",
        label: "Development",
        matcher: (article: Article) => {
          const haystack = normalizeLookupValue(
            `${article.title} ${article.description ?? ""} ${article.category ?? ""}`
          );
          return [
            "development",
            "housing",
            "construction",
            "transit",
            "rezoning",
            "project",
            "downtown",
            "council",
          ].some((term) => haystack.includes(term));
        },
      },
      {
        key: "sports",
        label: "Sports",
        matcher: (article: Article) => {
          const category = getCategoryLabel(getSafeCategoryLabel(article.category, article));
          const haystack = normalizeLookupValue(`${article.title} ${article.description ?? ""}`);
          return (
            category === "Sports" ||
            ["game", "playoff", "season", "team", "match", "coach"].some((term) =>
              haystack.includes(term)
            )
          );
        },
      },
      {
        key: "weather",
        label: "Weather",
        matcher: (article: Article) => {
          const haystack = normalizeLookupValue(`${article.title} ${article.description ?? ""}`);
          return ["weather", "forecast", "storm", "rain", "snow", "heat", "wind"].some((term) =>
            haystack.includes(term)
          );
        },
      },
      {
        key: "events",
        label: "Events",
        matcher: (article: Article) => {
          const haystack = normalizeLookupValue(`${article.title} ${article.description ?? ""}`);
          return ["event", "festival", "concert", "parade", "fair", "weekend", "celebration"].some(
            (term) => haystack.includes(term)
          );
        },
      },
    ] as const;

    return categoryDefinitions
      .map((definition) => ({
        key: definition.key,
        label: definition.label,
        articles: balancedLocalArticles.filter(definition.matcher).slice(0, 3),
      }))
      .filter((section) => section.articles.length > 0);
  }, [balancedLocalArticles, sortMode]);

  const topLocalStories = useMemo(() => {
    if (sortMode !== "local") {
      return [];
    }

    if (balancedLocalArticles.length > 0) {
      return balancedLocalArticles.slice(0, 6);
    }

    const fallbackStories = localCategorySections.flatMap((section) => section.articles);
    const seenArticleKeys = new Set<string>();

    return fallbackStories.filter((article) => {
      const articleKey = String(
        article.id || article.url || getArticleDeduplicationKey(article)
      );

      if (seenArticleKeys.has(articleKey)) {
        return false;
      }

      seenArticleKeys.add(articleKey);
      return true;
    });
  }, [balancedLocalArticles, localCategorySections, sortMode]);

  const navigableTopLocalStories = useMemo(
    () => topLocalStories.filter((article) => getArticleRouteId(article) !== null),
    [topLocalStories]
  );

  const localSourceSummaries = useMemo(() => {
    if (sortMode !== "local") {
      return [];
    }

    const sourceCounts = new Map<string, number>();

    balancedLocalArticles.forEach((article) => {
      const sourceName = getSafeSourceLabel(article.source);
      sourceCounts.set(sourceName, (sourceCounts.get(sourceName) ?? 0) + 1);
    });

    return [...sourceCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([sourceName, count]) => ({
        sourceName,
        count,
      }));
  }, [balancedLocalArticles, sortMode]);

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
                  <span className="trending-source-category-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="trending-source-category-inline">
                    {getCategoryLabel(safeCategoryName)}
                  </span>
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
          <Link
            href={`/article/${article.id}/`}
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

  const renderQuickWatchRow = () => {
    if (quickWatchVideos.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Quick Watch</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="Quick watch videos">
          {quickWatchVideos.map((video) => (
            <div key={video.id} className="quick-watch-item" role="listitem">
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
                previewDurationMs={4000}
                label="Quick Watch"
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderHomeTopNavigation = (activeMode: "trending" | "local") => (
    <div className="trending-tabs-wrap home-sections-nav">
      <div className="toolbar toolbar-centered">
        <button
          className={`toolbar-pill ${activeMode === "trending" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("trending")}
        >
          Trending
        </button>
        <button
          className={`toolbar-pill ${activeMode === "local" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("local")}
        >
          Local
        </button>
      </div>
    </div>
  );

  if (
    sortMode === "trending" &&
    isInitialFeedLoading &&
    visibleArticles.length === 0 &&
    !feedLoadError
  ) {
    return <LoadingScreen label="Loading Graffiti" message="Loading live stories..." />;
  }

  if (sortMode === "trending") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("trending")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <div className="home-section-title-row">
                <strong className="profile-section-title home-section-title">Top 10 Trending</strong>
                <span className="home-section-date">{todayLabel}</span>
              </div>
            </div>
          </div>
          <div className="stack home-section-list">
            {topTenTrendingArticles.map((article, index) => (
              <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                {renderArticleFeedCard(article, {
                  rankLabel: formatTopRankLabel(index + 1),
                })}
              </div>
            ))}
          </div>
        </section>

        {renderQuickWatchRow()}

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">My Feed</strong>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setCategoryDraft(categories);
                setCategorySheetStatus(null);
                setIsCategorySheetOpen(true);
              }}
            >
              {categories.length > 0 ? "Edit categories" : "Add categories"}
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="stack" style={{ gap: "12px" }}>
              <span className="muted">Pick a few topics to build this section.</span>
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

        <section className="section-card home-section-block">
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
            <div className="source-rankings-list">
              {homeSourceRankings.map((source, index) => (
                <Link
                  key={source.sourceName}
                  href={`/source/${slugifySourceName(source.sourceName)}/`}
                  className="source-rankings-row"
                >
                  <span className="source-rankings-rank">#{index + 1}</span>
                  <div className="source-rankings-brand">
                    <SourceBadge sourceName={source.sourceName} />
                    <span className="source-rankings-name">{source.sourceName}</span>
                  </div>
                  <div className="source-rankings-metrics">
                    <span
                      className={`icon-action-pill icon-action-pill-icon-only ${
                        source.heartedByCurrentUser ? "icon-action-pill-active" : ""
                      }`}
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
                    </span>
                    <strong>{source.likes}</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section-card home-section-block">
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
                <strong className="home-weather-temp">
                  {weatherCard ? `${Math.round(weatherCard.temperature)}°` : "—"}
                </strong>
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

            <div className="local-feed-chip-row" role="list" aria-label="Supported local cities">
              {LOCAL_CITY_SUGGESTIONS.map((city) => (
                <button
                  key={city}
                  type="button"
                  className={`chip local-feed-city-chip ${
                    localLocationLabel === city ? "local-feed-city-chip-active" : ""
                  }`}
                  onClick={() => {
                    applyLocalCitySelection(city);
                  }}
                >
                  {city}
                </button>
              ))}
            </div>

            {isWeatherNewsLoading ? <p className="settings-detail-note">Loading weather stories...</p> : null}

            {weatherNewsArticles.length === 0 && !isWeatherNewsLoading ? (
              <div className="empty-state compact-empty-state">
                <strong>No weather stories for {selectedLocalCity ?? "this city"} right now.</strong>
                <span>Try another supported city or check back shortly.</span>
              </div>
            ) : (
              <div className="compact-feed-module-list">
                {weatherNewsArticles.map((article) => (
                  <Link
                    key={article.id || article.url || getArticleDeduplicationKey(article)}
                    href={`/article/${article.id}/`}
                    className="compact-feed-module-link compact-feed-module-link-rich"
                  >
                    <strong>{cleanDisplayText(article.title)}</strong>
                    <span>{getSafeSourceLabel(article.source)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="section-card home-section-block">
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
            <div className="stack home-section-list">
              {topPollsSection.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  onVote={handleVoteOnPoll}
                  isVoting={activePollVoteId === poll.id}
                />
              ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Sports</strong>
            </div>
          </div>

          {sportsSectionArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No sports stories yet</strong>
              <span>Check back shortly for fresh sports coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {sportsSectionArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
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

  if (sortMode === "local") {
    return (
      <section className="page-shell home-sections-shell local-page-shell">
        {renderHomeTopNavigation("local")}

        <section className="section-card home-section-block local-page-hero">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Local</strong>
              <span className="muted">
                City-specific news only. No generic national fallback stories.
              </span>
            </div>
          </div>

          <div className="stack local-feed-shell">
            <div className="local-feed-top-row">
              <span className="local-feed-selected-label">
                Selected city: {selectedLocalCity ?? localLocationLabel}
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
            <div className="local-feed-chip-row" role="list" aria-label="Supported local cities">
              {LOCAL_CITY_SUGGESTIONS.map((city) => (
                <button
                  key={city}
                  type="button"
                  className={`chip local-feed-city-chip ${
                    localLocationLabel === city ? "local-feed-city-chip-active" : ""
                  }`}
                  onClick={() => {
                    applyLocalCitySelection(city);
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
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Top Local Stories</strong>
              <span className="muted">
                The strongest local matches for {selectedLocalCity ?? localLocationLabel}.
              </span>
            </div>
          </div>

          {isLocalAreaLoading && navigableTopLocalStories.length === 0 ? (
            <div className="muted">Loading local stories...</div>
          ) : navigableTopLocalStories.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>{localEmptyStateHeadline}</strong>
              <span>Choose a supported nearby city to explore local coverage.</span>
              <div className="local-feed-chip-row" role="list" aria-label="Suggested cities">
                {LOCAL_CITY_SUGGESTIONS.slice(0, 6).map((city) => (
                  <button
                    key={`suggested-${city}`}
                    type="button"
                    className="chip local-feed-city-chip"
                    onClick={() => {
                      applyLocalCitySelection(city);
                    }}
                  >
                    {city}
                  </button>
                ))}
              </div>
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

        <section className="section-card home-section-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
              <span className="muted">Current conditions for your selected local city.</span>
            </div>
          </div>

          <div className="home-weather-card">
            <div className="stack" style={{ gap: "4px" }}>
              <span className="home-weather-city">{selectedLocalCity ?? localLocationLabel}</span>
              <strong className="home-weather-temp">
                {weatherCard ? `${Math.round(weatherCard.temperature)}°` : "—"}
              </strong>
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
              <strong className="profile-section-title home-section-title">Local Categories</strong>
              <span className="muted">
                Crime, development, sports, weather, and event coverage for this city.
              </span>
            </div>
          </div>

          {localCategorySections.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No local category clusters yet</strong>
              <span>Try another city or check back for more local reporting.</span>
            </div>
          ) : (
            <div className="local-category-grid">
              {localCategorySections.map((section) => (
                <section key={section.key} className="home-section-block home-section-plain local-category-module">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">{section.label}</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list">
                    {section.articles.map((article) => (
                      <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                        {renderArticleFeedCard(article)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="section-card home-section-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Local Sources</strong>
              <span className="muted">Publishers showing up in this city right now.</span>
            </div>
          </div>

          {localSourceSummaries.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No local sources yet</strong>
              <span>Pick another supported city to view local publisher coverage.</span>
            </div>
          ) : (
            <div className="source-rankings-list">
              {localSourceSummaries.map((source, index) => (
                <Link
                  key={source.sourceName}
                  href={`/source/${slugifySourceName(source.sourceName)}/`}
                  className="source-rankings-row"
                >
                  <span className="source-rankings-rank">#{index + 1}</span>
                  <div className="source-rankings-brand">
                    <SourceBadge sourceName={source.sourceName} />
                    <span className="source-rankings-name">{source.sourceName}</span>
                  </div>
                  <div className="source-rankings-metrics">
                    <strong>{source.count}</strong>
                  </div>
                </Link>
              ))}
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
