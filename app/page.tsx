"use client";

import LoadingScreen from "./components/loading-screen";
import PollCard from "./components/poll-card";
import SourceBadge from "./components/source-badge";
import SourceHeaderMark from "./components/source-header-mark";
import VideoFeedCard from "./components/video-feed-card";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createBlockedUser,
  listBlockedUsers,
  listMutuallyHiddenUserIds,
} from "../lib/blocked-users";
import { apiFetch, buildApiUrl } from "../lib/api-base";
import {
  buildStableArticleKey,
  isMissingCommentKeyColumnError,
} from "../lib/article-identity";
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
  consumePendingVideoReturnState,
  saveVideoReturnState,
} from "../lib/video-navigation";
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
import {
  CATEGORY_OPTIONS,
  getCategoryImageUrl,
  getCategoryLabel,
  getDisplayCategory,
} from "../lib/categories";
import { normalizeVideoFeedItems, type VideoApiItem, type VideoItem } from "../lib/video-feed";

const FEED_PAGE_SIZE = 25;
const INITIAL_FEED_WARNING_MS = 4200;
const INITIAL_FEED_TIMEOUT_MS = 5000;
const DIRECT_ROUTE_TIMEOUT_MS = 10000;
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";
const SPORTS_UNIFIED_QUERY =
  "sports news | ESPN top headlines | NFL NBA MLB NHL MLS MMA sports news | NBA latest | ESPN NBA | NBA.com | Bleacher Report NBA | Yahoo Sports NBA | CBS Sports NBA | NBC Sports NBA | MLS news | Major League Soccer news | MLSsoccer.com | FC Cincinnati | ESPN MLS | The Athletic soccer | CBS Sports soccer | NBC Sports soccer | Yahoo Sports soccer | local MLS team news | ESPN | Bleacher Report | AP News Sports | AP Sports | Reuters Sports | BBC Sport | Motorsport.com | MMA Fighting | NHL.com | MLB.com | NFL.com | Yahoo Sports | NBC Sports | Fox Sports | CBS Sports latest";
const CELEBRITY_FEED_QUERY =
  "celebrity news | celebrity gossip | entertainment news | Hollywood news | music celebrity news | TMZ | People | Entertainment Tonight | Access Hollywood | Extra | Deadline | Entertainment Weekly | E! News | Variety | The Hollywood Reporter | Page Six | Us Weekly | Billboard";
const TECHNOLOGY_FEED_QUERY =
  "technology news | AI news | tech startups | Apple news | Google news | Microsoft news | cybersecurity news | social media news | The Verge | TechCrunch | Wired | Ars Technica | Engadget | CNET | CNBC Tech | Bloomberg Technology";
const TRAVEL_FEED_QUERY =
  "travel news | airline news | airport news | cruise news | tourism news | travel warning | travel advisory | hotel news | vacation travel news | Travel + Leisure | Condé Nast Traveler | AFAR | Skift | The Points Guy | CNN Travel | National Geographic Travel | Lonely Planet | USA Today Travel";
const FOOD_FEED_QUERY =
  "food news | restaurant news | fast food news | food safety | grocery news | recipes news | dining news | Eater | Food & Wine | Bon Appétit | Serious Eats | Restaurant Business | Food Network | CNN Food | USA Today Food";
const BUSINESS_FEED_QUERY =
  "business news | finance news | stock market news | economy news | Wall Street news | CNBC | Bloomberg | Reuters Business | MarketWatch | Yahoo Finance";
const MAJOR_WEATHER_CITY_SUGGESTIONS = [
  "Charlotte, NC",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Miami, FL",
  "Atlanta, GA",
  "Dallas, TX",
  "Phoenix, AZ",
  "San Diego, CA",
  "Philadelphia, PA",
  "Austin, TX",
] as const;
const BREAKING_NEWS_FEED_QUERY =
  "breaking news | live updates | just in | developing story | urgent | latest news";
const BREAKING_NEWS_TRUSTED_SOURCES = [
  "AP News",
  "Reuters",
  "CNN",
  "Fox News",
  "BBC News",
  "NBC News",
  "CBS News",
  "ABC News",
  "The New York Times",
  "The Washington Post",
  "Politico",
  "Bloomberg",
  "NPR",
  "USA Today",
  "Al Jazeera",
] as const;
const BREAKING_NEWS_REQUIRED_PATTERN =
  /\b(breaking|live updates?|developing|urgent|major|confirmed|emergency|killed|attack|court ruling|election|disaster|war|severe weather|government|economy)\b/i;
const BREAKING_NEWS_SOFT_STORY_PATTERN =
  /\b(ice cream|food|recipe|restaurant|travel|vacation|celebrity|hollywood|fashion|music awards|movie premiere|gossip|lifestyle|wellness|shopping)\b/i;
const FEATURED_SOURCE_NAMES = [
  "CNN",
  "Reuters",
  "BBC News",
  "NBC News",
  "CBS News",
  "ABC News",
  "NPR",
  "CNBC",
  "Bloomberg",
  "ESPN",
  "AP News",
  "Fox News",
] as const;
const SELECTED_CATEGORY_MATCHERS: Record<string, RegExp> = {
  Politics: /\b(politics?|election|campaign|congress|senate|white house|government|supreme court)\b/i,
  World: /\b(world|international|global|war|ukraine|russia|china|gaza|israel|europe|asia|middle east)\b/i,
  Business: /\b(business|earnings|company|companies|ceo|trade|commerce)\b/i,
  Tech: /\b(tech|technology|ai|artificial intelligence|apple|google|microsoft|meta|startup|cybersecurity|software)\b/i,
  Sports: /\b(sports?|espn|sportscenter|game|match|tournament|playoff|athlete|coach|league)\b/i,
  MLB: /\b(mlb|major league baseball|baseball)\b/i,
  NFL: /\b(nfl|national football league|football|touchdown|quarterback|super bowl)\b/i,
  NHL: /\b(nhl|national hockey league|hockey|stanley cup)\b/i,
  MLS: /\b(mls|major league soccer|soccer|fc\b|united\b)\b/i,
  "College Football": /\b(college football|ncaa football|sec football|big ten football|acc football)\b/i,
  "College Basketball": /\b(college basketball|ncaa basketball|march madness|final four)\b/i,
  Golf: /\b(golf|pga|masters|open championship|ryder cup)\b/i,
  NASCAR: /\b(nascar|daytona|indycar|stock car|cup series)\b/i,
  Health: /\b(health|medical|hospital|disease|wellness|vaccine|cdc|nih)\b/i,
  Science: /\b(science|research|space|nasa|study|physics|biology|astronomy)\b/i,
  Entertainment: /\b(entertainment|movie|movies|tv|television|streaming|hollywood|showbiz)\b/i,
  Celebrity: /\b(celebrity|celebrities|hollywood|tmz|people magazine|red carpet|actor|actress|singer)\b/i,
  Art: /\b(art|artist|museum|gallery|exhibit|painting|sculpture)\b/i,
  Music: /\b(music|album|song|concert|tour|billboard|recording)\b/i,
  Finance: /\b(finance|stock market|wall street|investing|fed|inflation|interest rate|banking)\b/i,
  Crime: /\b(crime|police|arrest|court|trial|murder|shooting|investigation)\b/i,
  Weather: /\b(weather|storm|forecast|tornado|hurricane|rain|snow|climate|radar)\b/i,
  Education: /\b(education|school|student|teacher|college|university|campus)\b/i,
  "Real Estate": /\b(real estate|housing|mortgage|home sales|property|rent)\b/i,
  "Local News": /\b(local news|community|county|city hall|neighborhood|regional)\b/i,
  Culture: /\b(culture|festival|heritage|museum|books|literature|theater)\b/i,
  Lifestyle: /\b(lifestyle|fashion|style|beauty|wellness|relationships|home)\b/i,
  Travel: /\b(travel|airline|airport|hotel|vacation|tourism|destination|cruise)\b/i,
  Food: /\b(food|restaurant|recipe|dining|chef|cooking|kitchen|grocery|menu)\b/i,
  Opinion: /\b(opinion|editorial|column|analysis|commentary)\b/i,
  "Breaking News": /\b(breaking|live updates|developing|urgent|just in|alert)\b/i,
};
const BROAD_SPORTS_SOURCE_PATTERN =
  /\b(motorsport\.com|motorsport|bleacher report|mlb\.com|nhl\.com|nba\.com|nfl\.com|mlssoccer\.com|espn|yahoo sports|fox sports|nbc sports|cbs sports|sports illustrated|ap sports|ap news sports|reuters sports|fc cincinnati|sports|athletics|sporting)\b/i;
const MY_NEWS_FEATURED_SPORTS_PATTERN =
  /\b(sports?|espn|cbs sports|sports illustrated|bleacher report|mlb|nba|nfl|nhl|mls|soccer|football|basketball|baseball|hockey)\b/i;
const TOP_QUICK_WATCH_PREFERRED_SOURCE_PATTERN =
  /\b(cnn|the new york times|new york times|nbc news|cbs news|abc news|reuters|associated press|ap news|bbc news|pbs newshour|cnbc|bloomberg|usa today|the guardian|guardian)\b/i;
const TOP_QUICK_WATCH_DEPRIORITIZED_SOURCE_PATTERN =
  /\b(al jazeera|al jazeera english|fox news)\b/i;
const QUICK_WATCH_COMBINED_LIMITED_SOURCES = new Set(["al jazeera", "al jazeera english", "fox news"]);
const RECIPE_PREFERRED_SOURCE_PATTERN =
  /\b(nyt cooking|allrecipes|food network|delish|bon appétit|bon appetit|serious eats|epicurious|taste of home|food & wine|food and wine|eater)\b/i;
const WEATHER_SOURCE_RENAME_PATTERN = /\bweather news\b/i;
const WEATHER_LIKE_ARTICLE_PATTERN =
  /\b(weather|storm|tornado|hurricane|rain|snow|forecast|radar|climate|flood|wildfire|local weather|severe weather)\b/i;
const WEATHER_SOURCE_INFERENCE_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bthe weather channel\b/i, label: "The Weather Channel" },
  { pattern: /\bfox weather\b/i, label: "Fox Weather" },
  { pattern: /\baccuweather\b/i, label: "AccuWeather" },
  { pattern: /\bweathernation\b/i, label: "WeatherNation" },
  { pattern: /\bnational weather service\b/i, label: "National Weather Service" },
  { pattern: /\bnoaa\b/i, label: "NOAA" },
  { pattern: /\bcnn weather\b/i, label: "CNN Weather" },
  { pattern: /\bnbc weather\b/i, label: "NBC Weather" },
  { pattern: /\bwbtv weather\b/i, label: "WBTV Weather" },
  { pattern: /\bwcnc weather\b/i, label: "WCNC Weather" },
  { pattern: /\bwsb-tv weather\b/i, label: "WSB-TV Weather" },
];
const FEED_META_ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 14,
  height: 14,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: false,
  "aria-hidden": true,
};

type SportsSectionKey = FavoriteLeagueKey | "NFL" | "MMA" | "MORE";

type SportsSectionConfig = {
  key: SportsSectionKey;
  label: string;
  scoreLeague?: SportsScoreLeague;
  articlePattern: RegExp;
  videoPattern: RegExp;
};

const SWIPEABLE_SORT_MODES = [
  "trending",
  "mynews",
  "local",
  "sports",
  "celebrity",
  "weather",
  "technology",
  "travel",
  "food",
  "business",
] as const;

type SwipeableSortMode = (typeof SWIPEABLE_SORT_MODES)[number];

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
  article_key?: string | null;
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

type RainViewerWeatherMapsResponse = {
  host?: string | null;
  radar?: {
    past?: Array<{
      time?: number | null;
      path?: string | null;
    }>;
    nowcast?: Array<{
      time?: number | null;
      path?: string | null;
    }>;
  } | null;
};

type RadarFramePoint = {
  tileUrl: string;
  timestamp: number;
  label: string;
  isFuture: boolean;
};

type NationalWeatherMapEmbedOptions = {
  showSelectedTimeLabel?: boolean;
  interactive?: boolean;
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
  highTemp?: number | null;
  lowTemp?: number | null;
  humidity?: number | null;
};

type WeatherForecastDay = {
  label: string;
  dateLabel: string;
  weatherLabel: string;
  highTemp: number | null;
  lowTemp: number | null;
};

type FavoriteTeamUpdate = {
  team: FavoriteTeamOption;
  article: Article | null;
  game: SportsScoreGame | null;
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
  statusDetail?: string | null;
  venue?: string | null;
  boxScoreAvailable?: boolean;
  playByPlayAvailable?: boolean;
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
    const cardImage = getBestArticleImage(article).src;
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
      cardImage: cardImage ?? null,
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

function getStableArticleKey(article: Pick<Article, "id" | "title" | "source" | "url" | "publishedAt">) {
  return buildStableArticleKey(article);
}

function isSportsFeaturedCandidate(article: Pick<Article, "title" | "source" | "category">) {
  const categoryLabel = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });
  const haystack = `${article.title} ${article.source} ${categoryLabel}`.toLowerCase();
  return MY_NEWS_FEATURED_SPORTS_PATTERN.test(haystack);
}

function articleMatchesSelectedCategory(article: Article, selectedCategory: string) {
  const displayCategory = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });

  if (displayCategory.toLowerCase() === selectedCategory.toLowerCase()) {
    return true;
  }

  const matcher = SELECTED_CATEGORY_MATCHERS[selectedCategory];

  if (!matcher) {
    return false;
  }

  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${displayCategory}`.toLowerCase();
  return matcher.test(haystack);
}

function videoMatchesSelectedCategory(video: VideoItem, selectedCategory: string) {
  const matcher = SELECTED_CATEGORY_MATCHERS[selectedCategory];

  if (!matcher) {
    return false;
  }

  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  return matcher.test(haystack);
}

function isRecipeArticle(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
  return /(recipe|recipes|how to make|chef|cook|cooking|bake|baking|dinner|dessert|meal prep|nyt cooking|allrecipes|food network|delish|bon appétit|serious eats|epicurious|taste of home|food & wine|eater)/.test(
    haystack
  );
}

function isRecipeVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  return /(recipe|recipes|how to make|chef|cook|cooking|bake|baking|dinner|dessert|meal prep|nyt cooking|allrecipes|food network|delish|bon appétit|serious eats|epicurious|taste of home|food & wine|eater)/.test(
    haystack
  );
}

function getRecipeSourcePriority(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return RECIPE_PREFERRED_SOURCE_PATTERN.test(value) ? 2 : 0;
}

function isBroadSportsArticle(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const displayCategory = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${displayCategory}`;
  return (
    SELECTED_CATEGORY_MATCHERS.Sports.test(haystack) || BROAD_SPORTS_SOURCE_PATTERN.test(haystack)
  );
}

function filterArticlesBySelectedCategories(articles: Article[], selectedCategories: string[]) {
  if (selectedCategories.length === 0) {
    return {
      filteredArticles: articles,
      removedCount: 0,
    };
  }

  const normalizedSelectedCategories = Array.from(
    new Set(selectedCategories.map((category) => cleanDisplayText(category).trim()).filter(Boolean))
  );
  const filteredArticles = articles.filter((article) =>
    normalizedSelectedCategories.some((category) => articleMatchesSelectedCategory(article, category))
  );

  return {
    filteredArticles,
    removedCount: Math.max(0, articles.length - filteredArticles.length),
  };
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

function parseForecastCalendarDate(dateString: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(`${dateString}T12:00:00`);
  }

  return new Date(dateString);
}

function formatForecastDayLabel(dateString: string, index: number) {
  const date = parseForecastCalendarDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return index === 0 ? "Today" : `Day ${index + 1}`;
  }

  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatForecastDateLabel(dateString: string) {
  const date = parseForecastCalendarDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRadarTimeLabel(timestampSeconds: number) {
  const date = new Date(timestampSeconds * 1000);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

function selectSourceBalancedVideos(
  videos: VideoItem[],
  limit: number,
  maxPerSourceOverride?: number
) {
  if (videos.length <= limit) {
    return videos;
  }

  const normalizedSourceCounts = new Map<string, number>();
  const normalizedSources = new Set(
    videos.map((video) => cleanDisplayText(video.creator).trim().toLowerCase()).filter(Boolean)
  );
  const maxPerSource =
    maxPerSourceOverride ?? (normalizedSources.size > 1 ? 2 : limit);
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

function ensureMinimumVideoCount(
  primaryVideos: VideoItem[],
  fallbackVideos: VideoItem[],
  minimumCount: number
) {
  if (primaryVideos.length >= minimumCount) {
    return primaryVideos;
  }

  const merged = dedupeVideosBySourceTitleAndUrl([...primaryVideos, ...fallbackVideos]);
  return merged.slice(0, Math.max(minimumCount, merged.length));
}

function prioritizeTopQuickWatchVideos(videos: VideoItem[]) {
  return [...videos].sort((leftVideo, rightVideo) => {
    const scoreVideo = (video: VideoItem) => {
      const source = cleanDisplayText(video.creator).trim().toLowerCase();
      const title = cleanDisplayText(video.title).trim().toLowerCase();
      let score = 0;

      if (TOP_QUICK_WATCH_PREFERRED_SOURCE_PATTERN.test(source)) {
        score += 120;
      }

      if (TOP_QUICK_WATCH_DEPRIORITIZED_SOURCE_PATTERN.test(source)) {
        score -= 48;
      }

      if (/(overlay|info card|end screen|subscribe)/i.test(title)) {
        score -= 40;
      }

      if (video.orientation === "vertical") {
        score += 28;
      }

      const publishedAt = video.publishedAt ? new Date(video.publishedAt).getTime() : 0;
      return score * 1_000_000 + publishedAt;
    };

    return scoreVideo(rightVideo) - scoreVideo(leftVideo);
  });
}

function buildTopQuickWatchRow(videos: VideoItem[], limit: number) {
  const selected: VideoItem[] = [];
  const sourceCounts = new Map<string, number>();
  let combinedLimitedCount = 0;
  const prioritizedVideos = prioritizeTopQuickWatchVideos(videos);

  for (const video of prioritizedVideos) {
    const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
    const sourceCount = sourceCounts.get(normalizedSource) ?? 0;
    const isCombinedLimitedSource = QUICK_WATCH_COMBINED_LIMITED_SOURCES.has(normalizedSource);

    if (sourceCount >= 1) {
      continue;
    }

    if (isCombinedLimitedSource && combinedLimitedCount >= 2) {
      continue;
    }

    selected.push(video);
    sourceCounts.set(normalizedSource, sourceCount + 1);

    if (isCombinedLimitedSource) {
      combinedLimitedCount += 1;
    }

    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const video of prioritizedVideos) {
      const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
      const sourceCount = sourceCounts.get(normalizedSource) ?? 0;
      const isCombinedLimitedSource = QUICK_WATCH_COMBINED_LIMITED_SOURCES.has(normalizedSource);

      if (selected.some((selectedVideo) => selectedVideo.id === video.id)) {
        continue;
      }

      if (sourceCount >= 2) {
        continue;
      }

      if (isCombinedLimitedSource && combinedLimitedCount >= 2) {
        continue;
      }

      selected.push(video);
      sourceCounts.set(normalizedSource, sourceCount + 1);

      if (isCombinedLimitedSource) {
        combinedLimitedCount += 1;
      }

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function dedupeVideosBySourceTitleAndUrl(videos: VideoItem[]) {
  return Array.from(
    new Map(
      videos.map((video) => [
        [
          cleanDisplayText(video.watchUrl).trim().toLowerCase(),
          cleanDisplayText(video.title).trim().toLowerCase(),
          cleanDisplayText(video.creator).trim().toLowerCase(),
        ].join("::"),
        video,
      ])
    ).values()
  );
}

function getBreakingNewsSourcePriority(article: Article) {
  const normalizedSource = getSafeSourceLabel(article.source).trim().toLowerCase();
  const trustedIndex = BREAKING_NEWS_TRUSTED_SOURCES.findIndex((source) =>
    normalizedSource.includes(source.toLowerCase())
  );

  if (trustedIndex >= 0) {
    return BREAKING_NEWS_TRUSTED_SOURCES.length - trustedIndex;
  }

  return 0;
}

function getBreakingNewsRelevanceScore(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.category} ${article.source}`;
  let score = getBreakingNewsSourcePriority(article) * 100;

  if (BREAKING_NEWS_REQUIRED_PATTERN.test(haystack)) {
    score += 180;
  }

  if (/\b(breaking news|live blog|live updates|developing story|just in)\b/i.test(haystack)) {
    score += 120;
  }

  if (BREAKING_NEWS_SOFT_STORY_PATTERN.test(haystack)) {
    score -= 220;
  }

  score += Math.max(
    0,
    72 - Math.floor((Date.now() - getPublishedAtTimestamp(article.publishedAt)) / (1000 * 60 * 60))
  );

  return score;
}

function buildNationalWeatherMapEmbedHtml(
  framePoints: RadarFramePoint[],
  pastFrameCount: number,
  options?: NationalWeatherMapEmbedOptions
) {
  const showSelectedTimeLabel = options?.showSelectedTimeLabel ?? false;
  const interactive = options?.interactive ?? false;
  const serializedFrames = JSON.stringify(framePoints);
  const currentFrameIndex = Math.max(0, pastFrameCount - 1);
  const leftBoundaryLabel = framePoints[0]?.label ?? "";
  const rightBoundaryLabel = framePoints[framePoints.length - 1]?.label ?? "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      crossorigin=""
    />
    <style>
      html, body, #map { margin: 0; height: 100%; width: 100%; background: #07111f; }
      body { overflow: hidden; }
      .leaflet-control-attribution { display: none; }
      .leaflet-container {
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.10), transparent 40%),
          linear-gradient(180deg, #08111f, #0b1728);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .map-shell {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
        height: 100%;
        width: 100%;
      }
      .map-badge {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 999;
        padding: 8px 10px;
        border-radius: 999px;
        color: rgba(226, 232, 240, 0.95);
        background: rgba(7, 17, 31, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.18);
        backdrop-filter: blur(12px);
        font-size: 12px;
        letter-spacing: 0.01em;
      }
      .timeline-shell {
        display: grid;
        gap: 8px;
        padding: 12px 14px 14px;
        background: rgba(7, 17, 31, 0.82);
        border-top: 1px solid rgba(148, 163, 184, 0.14);
      }
      .timeline-label-row, .timeline-meta-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: rgba(226, 232, 240, 0.92);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .timeline-label-row {
        font-size: 12px;
        letter-spacing: 0.02em;
      }
      .timeline-meta-row {
        font-size: 12px;
      }
      .timeline-meta-row[hidden] {
        display: none;
      }
      .timeline-slider {
        width: 100%;
        accent-color: #38bdf8;
      }
    </style>
  </head>
  <body>
    <div class="map-shell">
      <div style="position: relative; min-height: 0;">
        <div id="map"></div>
        <div class="map-badge">National radar</div>
      </div>
      <div class="timeline-shell">
        <div class="timeline-label-row">
          <span>${leftBoundaryLabel}</span>
          <span>Now</span>
          <span>${rightBoundaryLabel}</span>
        </div>
        <input id="timeline" class="timeline-slider" type="range" min="0" max="${Math.max(
          0,
          framePoints.length - 1
        )}" step="1" value="${currentFrameIndex}" />
        <div class="timeline-meta-row" ${showSelectedTimeLabel ? "" : "hidden"}>
          <span id="timelinePosition">Current</span>
        </div>
      </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      const frames = ${serializedFrames};
      const map = L.map("map", {
        zoomControl: false,
        attributionControl: false,
        dragging: ${interactive ? "true" : "false"},
        scrollWheelZoom: ${interactive ? "true" : "false"},
        doubleClickZoom: ${interactive ? "true" : "false"},
        boxZoom: ${interactive ? "true" : "false"},
        keyboard: false,
        tap: false
      }).setView([39.8283, -98.5795], 4);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 6
      }).addTo(map);

      const bounds = L.latLngBounds(
        L.latLng(24.396308, -125.0),
        L.latLng(49.384358, -66.93457)
      );
      map.fitBounds(bounds, { padding: [0, 0] });

      const timeline = document.getElementById("timeline");
      const timelinePosition = document.getElementById("timelinePosition");

      if (frames.length > 0) {
        const overlays = frames.map((frame) => {
          const overlay = L.tileLayer(frame.tileUrl, {
            tileSize: 256,
            opacity: 0,
            updateWhenIdle: true,
            crossOrigin: true
          });
          overlay.addTo(map);
          return overlay;
        });

        let activeIndex = ${currentFrameIndex};

        const setActiveFrame = (nextIndex) => {
          activeIndex = Math.max(0, Math.min(overlays.length - 1, Number(nextIndex) || 0));

          overlays.forEach((overlay, index) => {
            overlay.setOpacity(index === activeIndex ? 0.6 : 0);
          });

          if (timeline) {
            timeline.value = String(activeIndex);
          }

          if (timelinePosition) {
            const frame = frames[activeIndex];
            if (activeIndex === ${Math.max(0, pastFrameCount - 1)}) {
              timelinePosition.textContent = "Current";
            } else if (frame && frame.isFuture) {
              timelinePosition.textContent = frame.label;
            } else {
              timelinePosition.textContent = frame ? frame.label : "";
            }
          }
        };

        overlays.forEach((overlay) => {
          try {
            overlay.once("load", () => {});
          } catch (error) {}
        });

        setActiveFrame(activeIndex);

        if (timeline) {
          timeline.addEventListener("input", (event) => {
            setActiveFrame(event.target.value);
          });
        }
      }
    </script>
  </body>
</html>`;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLeagueTeamRegex(league: FavoriteLeagueKey) {
  const pattern = FAVORITE_TEAMS_BY_LEAGUE[league]
    .map((team) => escapeRegExp(team.team_name))
    .join("|");

  return new RegExp(pattern, "i");
}

const MLB_TEAM_REGEX = buildLeagueTeamRegex("MLB");
const NFL_TEAM_REGEX = buildLeagueTeamRegex("NFL");
const NBA_TEAM_REGEX = buildLeagueTeamRegex("NBA");
const MLS_TEAM_REGEX = buildLeagueTeamRegex("MLS");
const NHL_TEAM_REGEX = buildLeagueTeamRegex("NHL");

const SPORTS_SECTION_CONFIGS: SportsSectionConfig[] = [
  {
    key: "MLB",
    label: "MLB",
    scoreLeague: "MLB",
    articlePattern:
      /(mlb|baseball|world series|home run|pitcher|bullpen|diamondbacks|braves|orioles|red sox|cubs|white sox|reds|guardians|rockies|tigers|astros|royals|angels|dodgers|marlins|brewers|twins|mets|yankees|athletics|phillies|pirates|padres|giants|mariners|cardinals|rays|rangers|blue jays|nationals)/i,
    videoPattern:
      /(mlb|baseball|world series|home run|walk off|pitcher|bullpen|sportscenter top plays|espn highlights|mlb highlights|baseball highlights)/i,
  },
  {
    key: "NHL",
    label: "NHL",
    scoreLeague: "NHL",
    articlePattern:
      /(nhl|hockey|stanley cup|goalie|power play|hat trick|puck|bruins|sabres|flames|hurricanes|blackhawks|avalanche|blue jackets|stars|red wings|oilers|panthers|kings|minnesota wild|canadiens|predators|devils|islanders|rangers|senators|flyers|penguins|sharks|kraken|blues|lightning|maple leafs|utah mammoth|canucks|golden knights|capitals|jets)/i,
    videoPattern:
      /(nhl|hockey|stanley cup|goalie|hat trick|save|replay|top plays|nhl highlights|hockey highlights)/i,
  },
  {
    key: "NBA",
    label: "NBA",
    scoreLeague: "NBA",
    articlePattern:
      /(nba|basketball|playoffs|finals|dunk|buzzer beater|hawks|celtics|nets|hornets|bulls|cavaliers|mavericks|nuggets|pistons|warriors|rockets|pacers|clippers|lakers|grizzlies|heat|bucks|timberwolves|pelicans|knicks|thunder|magic|76ers|suns|trail blazers|kings|spurs|raptors|jazz|wizards)/i,
    videoPattern:
      /(nba|basketball|dunk|buzzer beater|replay|top plays|nba highlights|basketball highlights)/i,
  },
  {
    key: "NFL",
    label: "NFL",
    scoreLeague: "NFL",
    articlePattern:
      /(nfl|football|super bowl|touchdown|quarterback|draft|cardinals|falcons|ravens|bills|panthers|bears|bengals|browns|cowboys|broncos|lions|packers|texans|colts|jaguars|chiefs|raiders|chargers|rams|dolphins|vikings|patriots|saints|giants|jets|eagles|steelers|49ers|seahawks|buccaneers|titans|commanders)/i,
    videoPattern:
      /(nfl|football|touchdown|quarterback|top plays|replay|nfl highlights|football highlights)/i,
  },
  {
    key: "MLS",
    label: "Soccer / MLS",
    scoreLeague: "MLS",
    articlePattern:
      /(mls|soccer|football club|fc|goal|premier league|champions league|atlanta united|austin fc|charlotte fc|chicago fire|fc cincinnati|colorado rapids|columbus crew|d\.c\. united|fc dallas|houston dynamo|inter miami|la galaxy|los angeles fc|minnesota united|cf montreal|nashville sc|new england revolution|new york city fc|new york red bulls|orlando city|philadelphia union|portland timbers|real salt lake|san diego fc|san jose earthquakes|seattle sounders|sporting kansas city|st\. louis city|toronto fc|vancouver whitecaps|bbc sport)/i,
    videoPattern:
      /(mls|soccer|goal|assist|save|replay|soccer highlights|mls highlights|football highlights)/i,
  },
  {
    key: "MMA",
    label: "MMA",
    articlePattern:
      /(mma|ufc|bellator|pfl|boxing|knockout|submission|weigh in|octagon|fight card|combat sports|mma fighting)/i,
    videoPattern:
      /(mma|ufc|bellator|boxing|knockout|submission|fight highlights|mma highlights|ufc highlights)/i,
  },
  {
    key: "MORE",
    label: "More Sports",
    articlePattern: /(sports|athlete|coach|league|tournament|golf|tennis|nascar|formula 1|formula1|f1|olympics|ncaa)/i,
    videoPattern: /(sports|golf|tennis|nascar|formula 1|formula1|f1|olympics|top plays|highlights)/i,
  },
];

function getPublishedAtTimestamp(publishedAt: string | null | undefined) {
  if (!publishedAt) {
    return 0;
  }

  const timestamp = new Date(publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isSportsBettingAd(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
  const hasLegitimateReportingContext =
    /(sports betting legislation|gambling investigation|betting scandal|sportsbook revenue|state betting law|betting law|sportsbook business news|gambling probe|betting investigation)/i.test(
      haystack
    );

  if (hasLegitimateReportingContext) {
    return false;
  }

  return /(sports betting line|betting line|odds tracker|sportsbook promo|sign up bonus|get \$1,500|betmgm|draftkings|fanduel|caesars|bet365|parlay|spread pick|over\/under|bonus code|promo code|odds boost|\bodds\b)/i.test(
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

function isStrictNflVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasNflTerms =
    /(nfl|national football league|nfl network|espn nfl|monday night football|sunday night football|football highlights|touchdown|quarterback|super bowl|nfl films)/.test(
      haystack
    );
  const hasPreferredSource =
    /(nfl network|nfl\.com|espn|cbs sports nfl|nbc sports nfl|fox sports nfl|bleacher report nfl)/.test(
      haystack
    );
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress)/.test(
      haystack
    );

  return !hasRejectedTerms && (hasNflTerms || hasPreferredSource);
}

function matchesFavoriteLeagueTeamName(text: string, league: FavoriteLeagueKey) {
  const regexByLeague = {
    MLB: MLB_TEAM_REGEX,
    NFL: NFL_TEAM_REGEX,
    NBA: NBA_TEAM_REGEX,
    MLS: MLS_TEAM_REGEX,
    NHL: NHL_TEAM_REGEX,
  } satisfies Record<FavoriteLeagueKey, RegExp>;

  return regexByLeague[league].test(text);
}

function matchesSportsSectionArticle(article: Article, section: SportsSectionConfig) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  }`.toLowerCase();

  if (section.key === "MLB" && matchesFavoriteLeagueTeamName(haystack, "MLB")) {
    return true;
  }
  if (section.key === "NBA" && matchesFavoriteLeagueTeamName(haystack, "NBA")) {
    return true;
  }
  if (section.key === "MLS" && matchesFavoriteLeagueTeamName(haystack, "MLS")) {
    return true;
  }
  if (section.key === "NHL" && matchesFavoriteLeagueTeamName(haystack, "NHL")) {
    return true;
  }

  const sourceMatchedBySection =
    section.key === "MLB"
      ? /\b(mlb\.com|major league baseball|baseball america|athletic mlb|mlb news|baseball)\b/i.test(
          haystack
        )
      : section.key === "NBA"
        ? /\b(nba\.com|basketball|espn nba|bleacher report nba|yahoo sports nba|cbs sports nba|nbc sports nba)\b/i.test(
            haystack
          )
        : section.key === "NFL"
          ? /\b(nfl\.com|football|nfl network|espn nfl|yahoo sports nfl|cbs sports nfl|nbc sports nfl|fox sports nfl)\b/i.test(
              haystack
            )
          : section.key === "NHL"
            ? /\b(nhl\.com|hockey|nhl news|bleacher report nhl|espn nhl|yahoo sports nhl)\b/i.test(
                haystack
              )
            : section.key === "MLS"
              ? /\b(mlssoccer\.com|soccer|football club|fc cincinnati|inter miami|charlotte fc|atlanta united|premier league|champions league|bbc sport)\b/i.test(
                  haystack
                )
              : section.key === "MMA"
                ? /\b(mma|ufc|boxing|mma fighting|bellator|octagon|fight night)\b/i.test(
                    haystack
                  )
                : /\b(motorsport\.com|motorsport|nascar|formula 1|formula1|f1|indycar|golf|tennis|olympics|sports car|grand prix|race)\b/i.test(
                    haystack
                  );

  return section.articlePattern.test(haystack) || sourceMatchedBySection;
}

function matchesSportsSectionVideo(video: VideoItem, section: SportsSectionConfig) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();

  if (section.key === "NFL") {
    return isStrictNflVideo(video);
  }

  if (section.key === "MLB" && matchesFavoriteLeagueTeamName(haystack, "MLB")) {
    return true;
  }
  if (section.key === "NBA" && matchesFavoriteLeagueTeamName(haystack, "NBA")) {
    return true;
  }
  if (section.key === "MLS" && matchesFavoriteLeagueTeamName(haystack, "MLS")) {
    return true;
  }
  if (section.key === "NHL" && matchesFavoriteLeagueTeamName(haystack, "NHL")) {
    return true;
  }

  return section.videoPattern.test(haystack);
}

function getArticlePriorityScore(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  }`.toLowerCase();
  let score = 0;

  const source = getSafeSourceLabel(article.source).toLowerCase();

  if (
    /(ap news|ap sports|associated press|reuters|reuters sports|bbc news|bbc sport|cnn|new york times|washington post|politico|npr|espn|cbs sports|nbc sports|fox sports|yahoo sports|sports illustrated|bleacher report|bloomberg|wall street journal|the weather channel|mma fighting|mlb\.com|nba\.com|nfl\.com|nhl\.com|mlssoccer\.com|motorsport\.com|fc cincinnati)/.test(
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

function getDisplaySourceLabel(
  article: Pick<Article, "source" | "title" | "category" | "description" | "url">
) {
  const safeSource = getSafeSourceLabel(article.source);
  const haystack = `${safeSource} ${article.title ?? ""} ${article.category ?? ""} ${
    article.description ?? ""
  } ${article.url ?? ""}`;

  const inferredWeatherSource = WEATHER_SOURCE_INFERENCE_RULES.find((rule) =>
    rule.pattern.test(haystack)
  );

  if (inferredWeatherSource) {
    return inferredWeatherSource.label;
  }

  if (WEATHER_SOURCE_RENAME_PATTERN.test(safeSource) && WEATHER_LIKE_ARTICLE_PATTERN.test(haystack)) {
    return "Local Weather";
  }

  return safeSource;
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
    | "mynews"
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
  const [longPressMenuArticle, setLongPressMenuArticle] = useState<Article | null>(null);
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
  const [celebrityVideos, setCelebrityVideos] = useState<VideoItem[]>([]);
  const [weatherVideos, setWeatherVideos] = useState<VideoItem[]>([]);
  const [favoriteTeams, setFavoriteTeams] = useState<FavoriteTeamOption[]>([]);
  const [hasLoadedFavoriteTeams, setHasLoadedFavoriteTeams] = useState(false);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [activeTeamLeague, setActiveTeamLeague] = useState<FavoriteLeagueKey>("NFL");
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
  const [selectedSportsGame, setSelectedSportsGame] = useState<SportsScoreGame | null>(null);
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
  const [weatherSearchDraft, setWeatherSearchDraft] = useState("");
  const [selectedWeatherLocation, setSelectedWeatherLocation] = useState("");
  const [weatherPageCard, setWeatherPageCard] = useState<WeatherCardData | null>(null);
  const [weatherForecastDays, setWeatherForecastDays] = useState<WeatherForecastDay[]>([]);
  const [weatherForecastError, setWeatherForecastError] = useState<string | null>(null);
  const [isWeatherPageLoading, setIsWeatherPageLoading] = useState(false);
  const [nationalWeatherMapEmbedHtml, setNationalWeatherMapEmbedHtml] = useState<string | null>(null);
  const [nationalWeatherMapFullscreenHtml, setNationalWeatherMapFullscreenHtml] = useState<string | null>(
    null
  );
  const [isNationalWeatherMapLoading, setIsNationalWeatherMapLoading] = useState(false);
  const [isWeatherRadarOpen, setIsWeatherRadarOpen] = useState(false);
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
  const [foodPreviewArticles, setFoodPreviewArticles] = useState<Article[]>([]);
  const [isFoodPreviewLoading, setIsFoodPreviewLoading] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const trendingVideoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const teamPickerPagesRef = useRef<HTMLDivElement | null>(null);
  const moreSportsVideosSectionRef = useRef<HTMLElement | null>(null);
  const foodRecipesSectionRef = useRef<HTMLElement | null>(null);
  const foodRecipeVideosSectionRef = useRef<HTMLElement | null>(null);
  const foodLatestSectionRef = useRef<HTMLElement | null>(null);
  const topTabButtonRefs = useRef<Partial<Record<SwipeableSortMode, HTMLButtonElement | null>>>({});
  const articleLongPressTimerRef = useRef<number | null>(null);
  const [isMoreSportsVideosVisible, setIsMoreSportsVideosVisible] = useState(false);
  const teamPickerPanelRefs = useRef<Record<FavoriteLeagueKey, HTMLElement | null>>({
    MLB: null,
    NFL: null,
    NBA: null,
    MLS: null,
    NHL: null,
  });
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
  const weatherLocationStorageKey = "lastWeatherLocation";

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

    const panel = teamPickerPanelRefs.current[activeTeamLeague];

    if (!panel) {
      return;
    }

    window.requestAnimationFrame(() => {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
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
    if (sortMode === "mynews") {
      return "trending";
    }

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
          .select("id, article_id, article_key, text, username, user_id, created_at"),
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
      let comments = (readSettledData("comments", commentsResult) ?? []) as DbComment[];
      let commentsUseArticleKeyOnly = true;
      const commentsError =
        commentsResult.status === "fulfilled" ? commentsResult.value.error : null;
      if (
        commentsResult.status === "fulfilled" &&
        commentsError &&
        isMissingCommentKeyColumnError(commentsError.message)
      ) {
        commentsUseArticleKeyOnly = false;
        const legacyCommentsResult = await supabase
          .from("comments")
          .select("id, article_id, text, username, user_id, created_at");
        comments = ((legacyCommentsResult.data ?? []) as DbComment[]) ?? [];
      }
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
        const stableArticleKey = getStableArticleKey(item);
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
              (commentsUseArticleKeyOnly
                ? comment.article_key?.trim() === stableArticleKey
                : comment.article_id === item.id) &&
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
        const [newsResponse, sportsResponse, celebrityResponse, weatherResponse] = await Promise.all([
          apiFetch("/api/videos?tab=news"),
          apiFetch("/api/videos?tab=sports"),
          apiFetch("/api/videos?tab=celebrity"),
          apiFetch("/api/videos?tab=weather"),
        ]);
        if (!newsResponse.ok) {
          const responseText = await newsResponse.text();
          throw new Error(`Trending news videos request failed (${newsResponse.status}): ${responseText}`);
        }

        if (!sportsResponse.ok) {
          const responseText = await sportsResponse.text();
          throw new Error(`Trending sports videos request failed (${sportsResponse.status}): ${responseText}`);
        }

        if (!celebrityResponse.ok) {
          const responseText = await celebrityResponse.text();
          throw new Error(`Trending celebrity videos request failed (${celebrityResponse.status}): ${responseText}`);
        }

        if (!weatherResponse.ok) {
          const responseText = await weatherResponse.text();
          throw new Error(`Trending weather videos request failed (${weatherResponse.status}): ${responseText}`);
        }

        const [newsData, sportsData, celebrityData, weatherData] = await Promise.all([
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
          celebrityResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
          weatherResponse.json() as Promise<{
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

        if (celebrityData.fallback) {
          console.error("Trending celebrity videos fallback used", {
            message: celebrityData.message ?? "Unknown reason",
          });
        }

        if (weatherData.fallback) {
          console.error("Trending weather videos fallback used", {
            message: weatherData.message ?? "Unknown reason",
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

        const normalizedNewsVideos = sortVerticalFirst(normalizeVideoFeedItems(newsData.videos));
        const normalizedSportsVideos = sortVerticalFirst(normalizeVideoFeedItems(sportsData.videos));
        const normalizedCelebrityVideos = sortVerticalFirst(normalizeVideoFeedItems(celebrityData.videos));
        const normalizedWeatherVideos = sortVerticalFirst(normalizeVideoFeedItems(weatherData.videos));

        console.log("VIDEO FETCH COUNT", {
          news: normalizedNewsVideos.length,
          sports: normalizedSportsVideos.length,
          celebrity: normalizedCelebrityVideos.length,
          weather: normalizedWeatherVideos.length,
        });

        setVideos(normalizedNewsVideos);
        setSportsVideos(normalizedSportsVideos);
        setCelebrityVideos(normalizedCelebrityVideos);
        setWeatherVideos(normalizedWeatherVideos);
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos(normalizeVideoFeedItems());
        setSportsVideos(normalizeVideoFeedItems());
        setCelebrityVideos(normalizeVideoFeedItems());
        setWeatherVideos(normalizeVideoFeedItems());
      }
    }

    void loadTrendingVideos();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNationalWeatherMap() {
      setIsNationalWeatherMapLoading(true);

      try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");

        if (!response.ok) {
          throw new Error(`RainViewer request failed (${response.status})`);
        }

        const payload = (await response.json()) as RainViewerWeatherMapsResponse;
        const host = payload.host?.trim() ?? "";
        const pastFrames = (payload.radar?.past ?? [])
          .map((frame) => ({
            path: frame.path?.trim() ?? "",
            time: typeof frame.time === "number" ? frame.time : null,
          }))
          .filter((frame) => Boolean(frame.path) && typeof frame.time === "number")
          .slice(-6);
        const futureFrames = (payload.radar?.nowcast ?? [])
          .map((frame) => ({
            path: frame.path?.trim() ?? "",
            time: typeof frame.time === "number" ? frame.time : null,
          }))
          .filter((frame) => Boolean(frame.path) && typeof frame.time === "number")
          .slice(0, 3);
        const framePoints = [...pastFrames, ...futureFrames].map((frame, index) => ({
          tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
          timestamp: frame.time as number,
          label: formatRadarTimeLabel(frame.time as number),
          isFuture: index >= pastFrames.length,
        }));

        if (!host || framePoints.length === 0) {
          throw new Error("RainViewer payload missing host or frame paths");
        }
        const embedHtml = buildNationalWeatherMapEmbedHtml(framePoints, pastFrames.length);
        const fullscreenEmbedHtml = buildNationalWeatherMapEmbedHtml(framePoints, pastFrames.length, {
          showSelectedTimeLabel: true,
          interactive: true,
        });

        if (!cancelled) {
          setNationalWeatherMapEmbedHtml(embedHtml);
          setNationalWeatherMapFullscreenHtml(fullscreenEmbedHtml);
        }
      } catch (error) {
        console.error("NATIONAL WEATHER MAP LOAD ERROR", error);

        if (!cancelled) {
          setNationalWeatherMapEmbedHtml(null);
          setNationalWeatherMapFullscreenHtml(null);
        }
      } finally {
        if (!cancelled) {
          setIsNationalWeatherMapLoading(false);
        }
      }
    }

    void loadNationalWeatherMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fallbackLocation =
      localStorage.getItem(weatherLocationStorageKey)?.trim() ||
      selectedLocalCity ||
      (savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "") ||
      localLocationLabel ||
      DEFAULT_LOCAL_CITY;

    setSelectedWeatherLocation(fallbackLocation);
    setWeatherSearchDraft(fallbackLocation);
  }, [localLocationLabel, savedLocalCity, savedLocalState, selectedLocalCity, weatherLocationStorageKey]);

  useEffect(() => {
    if (!selectedWeatherLocation.trim()) {
      return;
    }

    let cancelled = false;

    async function loadWeatherLocationData() {
      setIsWeatherPageLoading(true);

      try {
        const normalizedLocation = selectedWeatherLocation.trim();
        const supportedCityCoords = LOCAL_CITY_COORDINATES[normalizedLocation];

        let latitude = supportedCityCoords?.latitude ?? null;
        let longitude = supportedCityCoords?.longitude ?? null;
        let resolvedLabel = normalizedLocation;

        if (latitude === null || longitude === null) {
          const geocodeResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
              normalizedLocation
            )}&count=1&language=en&format=json`
          );

          if (!geocodeResponse.ok) {
            throw new Error(`Weather geocode request failed (${geocodeResponse.status})`);
          }

          const geocodePayload = (await geocodeResponse.json()) as {
            results?: Array<{
              name?: string;
              admin1?: string;
              country_code?: string;
              latitude?: number;
              longitude?: number;
            }>;
          };

          const firstResult = geocodePayload.results?.[0];

          if (
            typeof firstResult?.latitude !== "number" ||
            typeof firstResult?.longitude !== "number"
          ) {
            throw new Error("No weather geocoding result found");
          }

          latitude = firstResult.latitude;
          longitude = firstResult.longitude;
          resolvedLabel = [firstResult.name, firstResult.admin1, firstResult.country_code]
            .filter(Boolean)
            .join(", ");
        }

        const forecastResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=10`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!forecastResponse.ok) {
          throw new Error(`Weather forecast request failed (${forecastResponse.status})`);
        }

        const forecastPayload = (await forecastResponse.json()) as {
          current?: {
            temperature_2m?: number;
            weather_code?: number;
            wind_speed_10m?: number;
            relative_humidity_2m?: number;
          };
          daily?: {
            time?: string[];
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
          };
        };

        if (cancelled || typeof forecastPayload.current?.temperature_2m !== "number") {
          return;
        }

        const dailyTimes = forecastPayload.daily?.time ?? [];
        const dailyCodes = forecastPayload.daily?.weather_code ?? [];
        const dailyHighs = forecastPayload.daily?.temperature_2m_max ?? [];
        const dailyLows = forecastPayload.daily?.temperature_2m_min ?? [];

        const nextForecastDays = dailyTimes.slice(0, 10).map((date, index) => ({
          label: formatForecastDayLabel(date, index),
          dateLabel: formatForecastDateLabel(date),
          weatherLabel: getWeatherLabel(dailyCodes[index]),
          highTemp: typeof dailyHighs[index] === "number" ? dailyHighs[index] ?? null : null,
          lowTemp: typeof dailyLows[index] === "number" ? dailyLows[index] ?? null : null,
        }));

        const nextWeatherPageCard = {
          temperature: forecastPayload.current.temperature_2m,
          weatherLabel: getWeatherLabel(forecastPayload.current.weather_code),
          windMph: forecastPayload.current.wind_speed_10m ?? null,
          humidity: forecastPayload.current.relative_humidity_2m ?? null,
          highTemp: nextForecastDays[0]?.highTemp ?? null,
          lowTemp: nextForecastDays[0]?.lowTemp ?? null,
          cityLabel: resolvedLabel,
        };

        setWeatherPageCard(nextWeatherPageCard);
        setWeatherForecastError(null);

        if (nextForecastDays.length < 2) {
          console.error("10-DAY FORECAST INCOMPLETE", nextForecastDays);
          setWeatherForecastDays([]);
          setWeatherForecastError("10-day forecast unavailable right now.");
        } else {
          setWeatherForecastDays(nextForecastDays);
        }

        setSelectedWeatherLocation(resolvedLabel);
        setWeatherSearchDraft(resolvedLabel);
        localStorage.setItem(weatherLocationStorageKey, resolvedLabel);
      } catch (error) {
        console.error("WEATHER PAGE LOAD ERROR", error);

        if (!cancelled) {
          setWeatherPageCard(null);
          setWeatherForecastDays([]);
          setWeatherForecastError("10-day forecast unavailable right now.");
        }
      } finally {
        if (!cancelled) {
          setIsWeatherPageLoading(false);
        }
      }
    }

    void loadWeatherLocationData();

    return () => {
      cancelled = true;
    };
  }, [selectedWeatherLocation, weatherLocationStorageKey]);

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
          categories.slice(0, 8).map(async (category) => {
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
        const { filteredArticles, removedCount } = filterArticlesBySelectedCategories(
          mergedArticles,
          categories
        );

        console.log("MY NEWS SELECTED CATEGORIES", categories);
        console.log("MY NEWS FILTERED COUNT", filteredArticles.length);
        console.log("MY NEWS REMOVED UNSELECTED COUNT", removedCount);

        setCategorySectionArticles(filteredArticles);
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
        setFoodPreviewArticles([]);
        setIsBreakingPreviewLoading(false);
        setIsSportsPreviewLoading(false);
        setIsCelebrityPreviewLoading(false);
        setIsTechnologyPreviewLoading(false);
        setIsBusinessPreviewLoading(false);
        setIsFoodPreviewLoading(false);
        return;
      }

      setIsBreakingPreviewLoading(true);
      setIsSportsPreviewLoading(true);
      setIsCelebrityPreviewLoading(true);
      setIsTechnologyPreviewLoading(true);
      setIsBusinessPreviewLoading(true);
      setIsFoodPreviewLoading(true);

      try {
        const [
          breakingResponse,
          sportsResponse,
          celebrityResponse,
          technologyResponse,
          businessResponse,
          foodResponse,
        ] = await Promise.all([
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
          fetch("/api/news?mode=food&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
        ]);

        const [
          breakingPayload,
          sportsPayload,
          celebrityPayload,
          technologyPayload,
          businessPayload,
          foodPayload,
        ] = await Promise.all([
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
          foodResponse.ok ? foodResponse.json().catch(() => null) : Promise.resolve(null),
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
        const nextFoodArticles = foodPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                foodPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];

        setBreakingPreviewArticles(nextBreakingArticles);
        setSportsPreviewArticles(nextSportsArticles);
        setCelebrityPreviewArticles(nextCelebrityArticles);
        setTechnologyPreviewArticles(nextTechnologyArticles);
        setBusinessPreviewArticles(nextBusinessArticles);
        setFoodPreviewArticles(nextFoodArticles);
      } catch (error) {
        console.error("TRENDING SECTION PREVIEW LOAD FAILED", error);
        if (!isCancelled) {
          setBreakingPreviewArticles([]);
          setSportsPreviewArticles([]);
          setCelebrityPreviewArticles([]);
          setTechnologyPreviewArticles([]);
          setBusinessPreviewArticles([]);
          setFoodPreviewArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsBreakingPreviewLoading(false);
          setIsSportsPreviewLoading(false);
          setIsCelebrityPreviewLoading(false);
          setIsTechnologyPreviewLoading(false);
          setIsBusinessPreviewLoading(false);
          setIsFoodPreviewLoading(false);
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

  const handleOpenFeedVideo = useCallback(
    (videoId: string, tab: "news" | "sports" | "celebrity") => {
      saveVideoReturnState({
        path: "/",
        scrollY: window.scrollY,
        sortMode,
        selectedLocalCity,
        localLocationLabel,
        tab,
        originLabel:
          sortMode === "sports"
            ? "Sports"
            : sortMode === "local"
              ? "Local"
              : "My News",
      });
      router.push(`/videos?tab=${tab}&video=${videoId}`);
    },
    [localLocationLabel, router, selectedLocalCity, sortMode]
  );

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

  const handleUpdateWeatherLocation = useCallback(() => {
    const nextLocation = cleanDisplayText(weatherSearchDraft).trim();

    if (!nextLocation) {
      return;
    }

    setSelectedWeatherLocation(nextLocation);
  }, [weatherSearchDraft]);

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
    if (
      sortMode !== "trending" &&
      sortMode !== "mynews" &&
      sortMode !== "sports" &&
      sortMode !== "local" &&
      sortMode !== "celebrity" &&
      sortMode !== "weather" &&
      sortMode !== "food"
    ) {
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
  }, [articles.length, celebrityVideos, sortMode, sportsVideos, videos, weatherVideos]);

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

  useEffect(() => {
    const pendingReturnState = consumePendingVideoReturnState();

    if (!pendingReturnState || pendingReturnState.path !== "/") {
      return;
    }

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (pendingReturnState.sortMode) {
        setSortMode(pendingReturnState.sortMode);
      }

      if (
        pendingReturnState.sortMode === "local" &&
        pendingReturnState.selectedLocalCity
      ) {
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
      setFoodPreviewArticles((prev) => updateArticles(prev));
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

  const handleCardSave = useCallback(
    async (article: Article) => {
      if (!userId) {
        alert("Log in to save articles");
        return;
      }

      const targetArticleId = article.id;
      const nextSaved = !article.saved;

      applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
        ...currentArticle,
        saved: nextSaved,
      }));

      if (article.saved) {
        const { error } = await supabase
          .from("saved_articles")
          .delete()
          .eq("user_id", userId)
          .eq("article_id", targetArticleId);

        if (error) {
          console.error("Error removing saved article:", error);
          applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
            ...currentArticle,
            saved: true,
          }));
          return;
        }

        return;
      }

      const { error } = await supabase.from("saved_articles").upsert(
        {
          user_id: userId,
          article_id: targetArticleId,
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

      if (error) {
        console.error("Error saving article:", error);
        applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
          ...currentArticle,
          saved: false,
        }));
      }
    },
    [applyArticleUpdateAcrossCollections, userId]
  );

  const handleCardShare = useCallback(async (article: Article) => {
    const shareUrl =
      article.url?.trim() ||
      (typeof window !== "undefined" && typeof article.id === "number"
        ? `${window.location.origin}/article/${article.id}/`
        : "");

    if (!shareUrl) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: cleanDisplayText(article.title),
          text: cleanDisplayText(article.title),
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard.");
    } catch (error) {
      console.error("ARTICLE SHARE FAILED", error);
    }
  }, []);

  const openLongPressMenu = useCallback((article: Article) => {
    setLongPressMenuArticle(article);
  }, []);

  const clearArticleLongPressTimer = useCallback(() => {
    if (articleLongPressTimerRef.current !== null) {
      window.clearTimeout(articleLongPressTimerRef.current);
      articleLongPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearArticleLongPressTimer(), [clearArticleLongPressTimer]);

  useEffect(() => {
    if (sortMode !== "sports") {
      setIsMoreSportsVideosVisible(false);
      return;
    }

    const node = moreSportsVideosSectionRef.current;

    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.28);

        if (isVisible) {
          console.log("MORE VIDEOS VERTICAL AUTOPLAY ATTEMPT");
        }

        setIsMoreSportsVideosVisible(isVisible);
      },
      {
        threshold: [0.16, 0.28, 0.45],
        rootMargin: "0px 0px -10% 0px",
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [sortMode, sportsVideos.length]);

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
    const stableArticleKey = targetArticle ? getStableArticleKey(targetArticle) : `id:${articleId}`;

    const fullCommentPayload = {
      article_id: articleId,
      article_key: stableArticleKey,
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
      (isMissingCommentMetadataColumnError(insertResponse.error.message) ||
        isMissingCommentKeyColumnError(insertResponse.error.message))
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
      (article) => !isSportsBettingAd(article)
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

  const weatherSectionContent = useMemo(() => {
    if (sortMode !== "weather") {
      return {
        severeWeather: [] as Article[],
        localWeather: [] as Article[],
        forecastRadar: [] as Article[],
        climateEnvironment: [] as Article[],
      };
    }

    const cityName =
      selectedLocalCity?.split(",")[0]?.trim().toLowerCase() ||
      localLocationLabel.split(",")[0]?.trim().toLowerCase() ||
      "";
    const usedKeys = new Set<string>();

    const pickSection = (pattern: RegExp, limit: number, options?: { requireCity?: boolean }) => {
      const matchingArticles = weatherTabArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);

        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        const haystack =
          `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();

        if (!pattern.test(haystack)) {
          return false;
        }

        if (options?.requireCity && cityName) {
          return haystack.includes(cityName);
        }

        return true;
      });

      const selected = selectSourceBalancedArticles(matchingArticles, limit);
      selected.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));
      return selected;
    };

    const severeWeather = pickSection(
      /\b(severe weather|storm|tornado|hurricane|flood|flooding|wildfire|blizzard|heat wave|storm surge|weather alert)\b/i,
      6
    );
    const localWeather = pickSection(
      /\b(local weather|weather news|forecast|rain|snow|storm|temperature|radar)\b/i,
      6,
      { requireCity: true }
    );
    const forecastRadar = pickSection(
      /\b(forecast|radar|outlook|futurecast|conditions|storm tracker|doppler)\b/i,
      6
    );
    const climateEnvironment = pickSection(
      /\b(climate|environment|wildfire smoke|heat advisory|air quality|drought|el niño|la niña)\b/i,
      6
    );

    return {
      severeWeather,
      localWeather,
      forecastRadar,
      climateEnvironment,
    };
  }, [localLocationLabel, selectedLocalCity, sortMode, weatherTabArticles]);

  const weatherPageVideos = useMemo(
    () =>
      selectSourceBalancedVideos(
        ensureMinimumVideoCount(
          weatherVideos.filter((video) => !video.fallback),
          weatherVideos.filter((video) => video.fallback),
          3
        ),
        8,
        2
      ),
    [weatherVideos]
  );

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
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(foodPreviewArticles.slice(0, 40), 25).filter((article) =>
        articleMatchesSelectedCategory(
          {
            ...article,
            comments: article.comments ?? [],
            likeUsers: article.likeUsers ?? [],
            likedByCurrentUser: article.likedByCurrentUser ?? false,
            saved: article.saved ?? false,
            likes: article.likes ?? 0,
          } as Article,
          "Food"
        )
      );
    }

    if (sortMode !== "food") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [foodPreviewArticles, sortMode, visibleArticles]);

  const foodSectionArticles = useMemo(() => {
    if (sortMode !== "food") {
      return {
        recipes: [] as Article[],
        latest: [] as Article[],
      };
    }

    const recipeArticles = selectSourceBalancedArticles(
      [...foodTabArticles.filter((article) => isRecipeArticle(article))].sort((left, right) => {
        const sourceDelta =
          getRecipeSourcePriority(right.source) - getRecipeSourcePriority(left.source);

        if (sourceDelta !== 0) {
          return sourceDelta;
        }

        const leftImage = getBestArticleImage(left);
        const rightImage = getBestArticleImage(right);
        const leftHasImage = isLikelyHighQualityArticleImage(leftImage.source, leftImage.src) ? 1 : 0;
        const rightHasImage = isLikelyHighQualityArticleImage(rightImage.source, rightImage.src) ? 1 : 0;

        if (rightHasImage !== leftHasImage) {
          return rightHasImage - leftHasImage;
        }

        return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
      }),
      10
    );
    const recipeKeys = new Set(recipeArticles.map((article) => getArticleDeduplicationKey(article)));
    const latestArticles = selectSourceBalancedArticles(
      foodTabArticles.filter((article) => !recipeKeys.has(getArticleDeduplicationKey(article))),
      18
    );

    return {
      recipes: recipeArticles,
      latest: latestArticles,
    };
  }, [foodTabArticles, sortMode]);

  const foodPageVideos = useMemo(() => {
    if (sortMode !== "food") {
      return [] as VideoItem[];
    }

    const foodVideos = dedupeVideosBySourceTitleAndUrl(
      videos.filter((video) => !isSportsVideo(video) && isRecipeVideo(video))
    ).sort((left, right) => {
      const sourceDelta =
        getRecipeSourcePriority(right.creator) - getRecipeSourcePriority(left.creator);

      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      const leftVertical = left.orientation === "vertical" ? 1 : 0;
      const rightVertical = right.orientation === "vertical" ? 1 : 0;

      if (rightVertical !== leftVertical) {
        return rightVertical - leftVertical;
      }

      return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
    });

    return selectSourceBalancedVideos(foodVideos, 8, 2);
  }, [sortMode, videos]);

  const personalizedMyNewsArticles = useMemo(() => {
    if (categories.length === 0) {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(categorySectionArticles.slice(0, 60), 25);
  }, [categories.length, categorySectionArticles]);

  const myNewsCategorySections = useMemo(() => {
    if (categories.length === 0) {
      return [] as Array<{ category: string; articles: Article[] }>;
    }

    const recommendedArticles = selectSourceBalancedArticles(categorySectionArticles.slice(0, 18), 8);
    const usedKeys = new Set<string>();

    const sections = categories
      .map((category) => {
        const matchingArticles = categorySectionArticles.filter((article) => {
          const dedupeKey = getArticleDeduplicationKey(article);
          if (usedKeys.has(dedupeKey)) {
            return false;
          }

          return articleMatchesSelectedCategory(article, category);
        });

        const selectedArticles = selectSourceBalancedArticles(matchingArticles, 6);
        selectedArticles.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));

        return {
          category,
          articles: selectedArticles,
        };
      })
      .filter((section) => section.articles.length > 0);

    return [
      ...sections,
      {
        category: "Recommended for You",
        articles: recommendedArticles.filter(
          (article) => !usedKeys.has(getArticleDeduplicationKey(article))
        ),
      },
    ];
  }, [categories, categorySectionArticles]);

  const myNewsCategoryVideoSections = useMemo(() => {
    if (categories.length === 0) {
      return {} as Record<string, VideoItem[]>;
    }

    const candidateVideos = dedupeVideosBySourceTitleAndUrl([
      ...sportsVideos,
      ...celebrityVideos,
      ...weatherVideos,
      ...videos,
    ]);
    const usedVideoIds = new Set<string>();
    const sectionVideos: Record<string, VideoItem[]> = {};

    categories.forEach((category) => {
      const matchingVideos = candidateVideos.filter((video) => {
        if (usedVideoIds.has(video.id)) {
          return false;
        }

        return videoMatchesSelectedCategory(video, category);
      });

      const selectedVideos = selectSourceBalancedVideos(
        matchingVideos.sort((left, right) => {
          const leftVerticalBoost = left.orientation === "vertical" ? 1 : 0;
          const rightVerticalBoost = right.orientation === "vertical" ? 1 : 0;

          if (rightVerticalBoost !== leftVerticalBoost) {
            return rightVerticalBoost - leftVerticalBoost;
          }

          return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
        }),
        5,
        1
      );

      selectedVideos.forEach((video) => usedVideoIds.add(video.id));
      sectionVideos[category] = selectedVideos;
    });

    return sectionVideos;
  }, [categories, celebrityVideos, sportsVideos, videos, weatherVideos]);

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

  useEffect(() => {
    if (!SWIPEABLE_SORT_MODES.includes(sortMode as SwipeableSortMode)) {
      return;
    }

    const activeButton = topTabButtonRefs.current[sortMode as SwipeableSortMode];
    activeButton?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [sortMode]);

  const localCitySuggestions = useMemo(() => {
    if (sortMode !== "local" && sortMode !== "trending") {
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

  const weatherCitySuggestions = useMemo(() => {
    const suggestionPool = Array.from(
      new Set([
        ...MAJOR_WEATHER_CITY_SUGGESTIONS,
        ...cityOptions.map((city) => city.displayName),
      ])
    );
    const normalizedDraft = cleanDisplayText(weatherSearchDraft).trim().toLowerCase();

    if (normalizedDraft.length === 0) {
      return suggestionPool.slice(0, 8);
    }

    const startsWithMatches = suggestionPool.filter((city) =>
      city.toLowerCase().startsWith(normalizedDraft)
    );
    const includesMatches = suggestionPool.filter(
      (city) =>
        !startsWithMatches.includes(city) && city.toLowerCase().includes(normalizedDraft)
    );

    return [...startsWithMatches, ...includesMatches].slice(0, 8);
  }, [cityOptions, weatherSearchDraft]);

  const trendingWeatherSections = useMemo(() => {
    const normalizedCityName =
      (selectedWeatherLocation || selectedLocalCity || localLocationLabel)
        .split(",")[0]
        ?.trim()
        .toLowerCase() ?? "";

    const localStationPattern =
      /\b(weather|local|wbtv|wcnc|wsb-tv|khou|kxan|kvue|wfaa|fox \d+|abc \d+|nbc \d+|cbs \d+|queen city news|first coast news)\b/i;
    const nationalWeatherPattern =
      /\b(the weather channel|fox weather|accuweather|weathernation|national weather service|noaa|cnn weather|nbc weather)\b/i;

    const localWeather = selectSourceBalancedArticles(
      weatherNewsArticles.filter((article) => {
        const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
        return (
          (Boolean(normalizedCityName) && haystack.includes(normalizedCityName)) ||
          (localStationPattern.test(haystack) && !nationalWeatherPattern.test(haystack))
        );
      }),
      3
    );

    const localKeys = new Set(localWeather.map((article) => getArticleDeduplicationKey(article)));
    const nationalWeather = selectSourceBalancedArticles(
      weatherNewsArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (localKeys.has(dedupeKey)) {
          return false;
        }

        const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
        return WEATHER_LIKE_ARTICLE_PATTERN.test(haystack);
      }),
      3
    );

    return {
      localWeather,
      nationalWeather,
    };
  }, [localLocationLabel, selectedLocalCity, selectedWeatherLocation, weatherNewsArticles]);

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
    const playableVideos = videos.filter((video) => !isSportsVideo(video));
    const effectivePlayableVideos = ensureMinimumVideoCount(
      playableVideos.filter((video) => !video.fallback),
      playableVideos.filter((video) => video.fallback),
      5
    );
    const preferredVertical = effectivePlayableVideos.filter(
      (video) =>
        video.orientation === "vertical" ||
        /shorts?|reels?|vertical|portrait/i.test(
          `${video.title} ${video.watchUrl} ${video.thumbnailUrl ?? ""}`
        )
    );

    const mergedPreferredPool = dedupeVideosBySourceTitleAndUrl([
      ...preferredVertical,
      ...effectivePlayableVideos,
    ]);
    const finalPool = selectSourceBalancedVideos(prioritizeTopQuickWatchVideos(mergedPreferredPool), 24);
    console.log("VIDEO FINAL COUNT", { section: "my-news-pool", count: finalPool.length });
    return finalPool;
  }, [videos]);

  const myNewsQuickWatchVideos = useMemo(
    () => buildTopQuickWatchRow(myNewsVideoPool, 5),
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
    const highSignalTrustedArticles = trustedBreakingArticles.filter((article) =>
      BREAKING_NEWS_REQUIRED_PATTERN.test(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.category}`
      )
    );

    const candidateArticles =
      highSignalTrustedArticles.length >= 3
        ? highSignalTrustedArticles
        : trustedBreakingArticles.length >= 5
          ? trustedBreakingArticles
          : breakingPreviewArticles;

    return selectSourceBalancedArticles(
      candidateArticles
        .filter((article) => {
          if (topTrendingKeys.has(getArticleDeduplicationKey(article))) {
            return false;
          }

          return getBreakingNewsRelevanceScore(article) > 0;
        })
        .sort((leftArticle, rightArticle) => {
          const relevanceDelta =
            getBreakingNewsRelevanceScore(rightArticle) - getBreakingNewsRelevanceScore(leftArticle);

          if (relevanceDelta !== 0) {
            return relevanceDelta;
          }

          const leftTime = leftArticle.publishedAt
            ? new Date(leftArticle.publishedAt).getTime()
            : 0;
          const rightTime = rightArticle.publishedAt
            ? new Date(rightArticle.publishedAt).getTime()
            : 0;
          return rightTime - leftTime;
        }),
      5
    ).slice(0, 5);
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

        if (isSportsFeaturedCandidate(article)) {
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

        if (isSportsFeaturedCandidate(article)) {
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
        ensureMinimumVideoCount(
          [...sportsVideos, ...videos]
          .filter((video) => {
            return (
              isSportsVideo(video) ||
              (video.fallback &&
                /\b(sports|football|basketball|baseball|hockey|soccer|highlights?|top plays)\b/i.test(
                  `${video.category} ${video.title} ${video.creator}`
                ))
            );
          })
          .sort((left, right) => {
            const scoreVideo = (video: VideoItem) => {
              const haystack = `${video.title} ${video.creator} ${video.category}`.toLowerCase();
              let score = 0;

              if (/(highlights|top plays|goals?|dunk|touchdown|home run|save|replay|buzzer beater|walk off|game winner|slam dunk)/.test(haystack)) {
                score += 140;
              }

              if (/(nfl network|nfl films|monday night football|sunday night football|espn nfl|cbs sports nfl|nbc sports nfl|fox sports nfl|bleacher report nfl)/.test(haystack)) {
                score += 120;
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
          [...sportsVideos, ...videos].filter((video) => video.fallback),
          3
        ),
        24
      ),
    [sportsVideos, videos]
  );

  const sportsStandardArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    return sportsTabArticles;
  }, [sortMode, sportsTabArticles]);

  const sportsFeaturedArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    const seenKeys = new Set<string>();

    return selectSourceBalancedArticles(
      sportsStandardArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);

        if (seenKeys.has(dedupeKey)) {
          return false;
        }

        seenKeys.add(dedupeKey);
        return true;
      }),
      8
    );
  }, [sortMode, sportsStandardArticles]);

  const favoriteTeamGames = useMemo(() => {
    const matchedGames: SportsScoreGame[] = [];
    const seenGameIds = new Set<string>();

    favoriteTeams.forEach((team) => {
      const leagueGames = sportsScoresByLeague[team.league] ?? [];
      const teamName = team.team_name.toLowerCase();
      const matchingGame = leagueGames.find(
        (game) =>
          game.homeTeam.name.toLowerCase() === teamName ||
          game.awayTeam.name.toLowerCase() === teamName
      );

      if (!matchingGame || seenGameIds.has(matchingGame.id)) {
        return;
      }

      seenGameIds.add(matchingGame.id);
      matchedGames.push(matchingGame);
    });

    return matchedGames;
  }, [favoriteTeams, sportsScoresByLeague]);

  const topSportsGames = useMemo(() => {
    return Object.values(sportsScoresByLeague)
      .flat()
      .sort((left, right) => {
        const statusRank = (game: SportsScoreGame) =>
          game.status === "Live" ? 3 : game.status === "Today" ? 2 : game.status === "Upcoming" ? 1 : 0;

        const statusDelta = statusRank(right) - statusRank(left);
        if (statusDelta !== 0) {
          return statusDelta;
        }

        const rightTime = right.scheduledAt ? new Date(right.scheduledAt).getTime() : 0;
        const leftTime = left.scheduledAt ? new Date(left.scheduledAt).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 8);
  }, [sportsScoresByLeague]);

  const sportsLeagueSections = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Array<{
        key: SportsSectionKey;
        label: string;
        scoreLeague?: SportsScoreLeague;
        scores: SportsScoreGame[];
        articles: Article[];
        videos: VideoItem[];
      }>;
    }

    const usedArticleKeys = new Set<string>();
    const usedVideoKeys = new Set<string>();

    sportsFeaturedArticles.forEach((article) => {
      usedArticleKeys.add(getArticleDeduplicationKey(article));
    });

    return SPORTS_SECTION_CONFIGS.map((section) => {
      const favoriteLeagueTeams =
        section.key === "MMA" || section.key === "MORE"
          ? []
          : favoriteTeams.filter((team) => team.league === section.key);

      const candidateArticles = sportsStandardArticles.filter((article) => {
        if (usedArticleKeys.has(getArticleDeduplicationKey(article))) {
          return false;
        }

        if (section.key === "MORE") {
          return !SPORTS_SECTION_CONFIGS.filter((candidate) => candidate.key !== "MORE").some(
            (candidate) => matchesSportsSectionArticle(article, candidate)
          );
        }

        return matchesSportsSectionArticle(article, section);
      });

      const sortedArticles = [...candidateArticles].sort((leftArticle, rightArticle) => {
        const leftText = `${leftArticle.title} ${leftArticle.description ?? ""}`.toLowerCase();
        const rightText = `${rightArticle.title} ${rightArticle.description ?? ""}`.toLowerCase();
        const leftFavoriteBoost = favoriteLeagueTeams.some((team) =>
          leftText.includes(team.team_name.toLowerCase())
        )
          ? 1
          : 0;
        const rightFavoriteBoost = favoriteLeagueTeams.some((team) =>
          rightText.includes(team.team_name.toLowerCase())
        )
          ? 1
          : 0;

        if (rightFavoriteBoost !== leftFavoriteBoost) {
          return rightFavoriteBoost - leftFavoriteBoost;
        }

        return getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);
      });

      const sectionArticleLimit = section.key === "NBA" || section.key === "MLS" ? 6 : 5;
      const selectedArticles = selectSourceBalancedArticles(sortedArticles, sectionArticleLimit);
      selectedArticles.forEach((article) => {
        usedArticleKeys.add(getArticleDeduplicationKey(article));
      });

      const candidateVideos = sportsVideoPool.filter((video) => {
        if (usedVideoKeys.has(video.id)) {
          return false;
        }

        if (section.key === "MORE") {
          return !SPORTS_SECTION_CONFIGS.filter((candidate) => candidate.key !== "MORE").some(
            (candidate) => matchesSportsSectionVideo(video, candidate)
          );
        }

        return matchesSportsSectionVideo(video, section);
      });

      const sectionVideoLimit = section.key === "NFL" ? 6 : 5;
      const selectedVideos = selectSourceBalancedVideos(candidateVideos, sectionVideoLimit);
      selectedVideos.forEach((video) => {
        usedVideoKeys.add(video.id);
      });

      const scores = section.scoreLeague
        ? [...(sportsScoresByLeague[section.scoreLeague] ?? [])].sort((left, right) => {
            const normalizedFavoriteNames = new Set(
              favoriteLeagueTeams.map((team) => team.team_name.toLowerCase())
            );
            const leftFavoriteScore =
              Number(normalizedFavoriteNames.has(left.homeTeam.name.toLowerCase())) +
              Number(normalizedFavoriteNames.has(left.awayTeam.name.toLowerCase()));
            const rightFavoriteScore =
              Number(normalizedFavoriteNames.has(right.homeTeam.name.toLowerCase())) +
              Number(normalizedFavoriteNames.has(right.awayTeam.name.toLowerCase()));

            if (rightFavoriteScore !== leftFavoriteScore) {
              return rightFavoriteScore - leftFavoriteScore;
            }

            const statusRank = (game: SportsScoreGame) =>
              game.status === "Live" ? 3 : game.status === "Today" ? 2 : game.status === "Upcoming" ? 1 : 0;

            return statusRank(right) - statusRank(left);
          })
        : [];

      return {
        key: section.key,
        label: section.label,
        scoreLeague: section.scoreLeague,
        scores,
        articles: selectedArticles,
        videos: selectedVideos,
      };
    }).filter((section) => section.scores.length > 0 || section.articles.length > 0 || section.videos.length > 0);
  }, [favoriteTeams, sortMode, sportsFeaturedArticles, sportsScoresByLeague, sportsStandardArticles, sportsVideoPool]);

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
      const game =
        (sportsScoresByLeague[team.league] ?? []).find((candidate) => {
          const homeTeam = candidate.homeTeam.name.toLowerCase();
          const awayTeam = candidate.awayTeam.name.toLowerCase();
          return homeTeam === normalizedTeamName || awayTeam === normalizedTeamName;
        }) ?? null;
      const article =
        sportsTabArticles.find((candidate) => {
          const haystack = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
          return haystack.includes(normalizedTeamName);
        }) ?? null;

      return {
        team,
        article,
        game,
      };
    });
  }, [favoriteTeams, sportsScoresByLeague, sportsTabArticles]);

  const usedSportsSectionArticleKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    sportsFeaturedArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    sportsLeagueSections.forEach((section) => {
      section.articles.forEach((article) => {
        usedKeys.add(getArticleDeduplicationKey(article));
      });
    });

    return usedKeys;
  }, [sportsFeaturedArticles, sportsLeagueSections]);

  const favoriteTeamNewsArticles = useMemo(() => {
    if (sortMode !== "sports" || favoriteTeams.length === 0) {
      return [] as Article[];
    }

    const selectedArticles = sportsStandardArticles.filter((article) => {
      const dedupeKey = getArticleDeduplicationKey(article);
      if (usedSportsSectionArticleKeys.has(dedupeKey)) {
        return false;
      }

      const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
      return favoriteTeams.some((team) => haystack.includes(team.team_name.toLowerCase()));
    });

    return selectSourceBalancedArticles(selectedArticles, 8);
  }, [favoriteTeams, sortMode, sportsStandardArticles, usedSportsSectionArticleKeys]);

  const featuredCelebrityArticles = useMemo(
    () => selectSourceBalancedArticles(celebrityTabArticles.slice(0, 18), 8),
    [celebrityTabArticles]
  );

  const buildCelebritySection = useCallback(
    (
      pattern: RegExp,
      limit: number,
      usedKeys: Set<string>
    ) => {
      const matches = celebrityTabArticles.filter((article) => {
        const haystack =
          `${article.title} ${article.source} ${article.category} ${article.description ?? ""}`.toLowerCase();
        return pattern.test(haystack) && !usedKeys.has(getArticleDeduplicationKey(article));
      });
      const selected = selectSourceBalancedArticles(matches, limit);
      selected.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));
      return selected;
    },
    [celebrityTabArticles]
  );

  const celebritySectionContent = useMemo(() => {
    const usedKeys = new Set(
      featuredCelebrityArticles.map((article) => getArticleDeduplicationKey(article))
    );

    const movies = buildCelebritySection(
      /\b(movie|film|box office|hollywood movie|trailer|deadline film|variety film|cinema)\b/i,
      6,
      usedKeys
    );
    const music = buildCelebritySection(
      /\b(music|album|song|tour|billboard|concert|recording artist|grammy)\b/i,
      6,
      usedKeys
    );
    const tvShows = buildCelebritySection(
      /\b(tv|television|streaming|series|episode|showrunner|season premiere|netflix|hulu|max)\b/i,
      6,
      usedKeys
    );
    const gossip = buildCelebritySection(
      /\b(gossip|tmz|people|e news|red carpet|dating|celebrity style|paparazzi)\b/i,
      6,
      usedKeys
    );

    return { movies, music, tvShows, gossip };
  }, [buildCelebritySection, featuredCelebrityArticles]);

  const celebrityPageVideos = useMemo(
    () =>
      ensureMinimumVideoCount(
        celebrityVideos.filter((video) => !video.fallback).slice(0, 8),
        celebrityVideos.filter((video) => video.fallback),
        3
      ),
    [celebrityVideos]
  );

  const localSectionArticles = useMemo(() => {
    if (sortMode !== "local") {
      return {
        localSports: [] as Article[],
        developmentBusiness: [] as Article[],
        eventsThingsToDo: [] as Article[],
        foodRestaurants: [] as Article[],
      };
    }

    const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const cityName = cityLabel.split(",")[0]?.trim().toLowerCase() ?? "";
    const usedTopLocalKeys = new Set(
      balancedLocalArticles
        .slice(0, 6)
        .map((article) => getArticleDeduplicationKey(article))
    );

    const cityAwareArticles = balancedLocalArticles.filter((article) => {
      const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
      return cityName ? haystack.includes(cityName) || haystack.includes("local") : true;
    });

    const pickSection = (pattern: RegExp, limit: number) =>
      selectSourceBalancedArticles(
        cityAwareArticles.filter((article) => {
          const dedupeKey = getArticleDeduplicationKey(article);
          if (usedTopLocalKeys.has(dedupeKey)) {
            return false;
          }

          const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
          return pattern.test(haystack);
        }),
        limit
      );

    return {
      localSports: pickSection(
        /\b(sports?|game|match|playoffs?|team|athlete|baseball|football|basketball|soccer|hockey)\b/i,
        4
      ),
      developmentBusiness: pickSection(
        /\b(development|business|economy|downtown|housing|real estate|construction|retail|office|zoning|infrastructure)\b/i,
        4
      ),
      eventsThingsToDo: pickSection(
        /\b(events?|things to do|festival|concert|weekend|arts|museum|show|fair|community event)\b/i,
        4
      ),
      foodRestaurants: pickSection(
        /\b(food|restaurant|restaurants|dining|chef|bar|cafe|eatery|menu|brunch)\b/i,
        4
      ),
    };
  }, [balancedLocalArticles, selectedLocalCity, sortMode]);

  const localVideoItems = useMemo(() => {
    if (sortMode !== "local") {
      return [] as VideoItem[];
    }

    const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const cityName = cityLabel.split(",")[0]?.trim().toLowerCase() ?? "";
    if (!cityName) {
      return [] as VideoItem[];
    }

    const localMatches = videos.filter((video) => {
      const haystack = `${video.title} ${video.creator} ${video.category}`.toLowerCase();
      return haystack.includes(cityName);
    });

    return selectSourceBalancedVideos(localMatches, 6);
  }, [selectedLocalCity, sortMode, videos]);

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
      console.log(
        "SPORTS LEAGUE SECTION COUNTS",
        sportsLeagueSections.map((section) => ({
          key: section.key,
          articleCount: section.articles.length,
          videoCount: section.videos.length,
          scoreCount: section.scores.length,
        }))
      );
      console.log("SPORTS IMAGE COUNT", sportsImageCount);
    }
  }, [
    myNewsImageCount,
    myNewsFeaturedArticles.length,
    myNewsFeaturedVideos.length,
    sportsImageCount,
    sportsLeagueSections,
    sportsVideoPool.length,
    sortMode,
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

  const featuredSources = useMemo<RankedSourceSummary[]>(() => {
    const featuredSourceMap = new Map<string, RankedSourceSummary>();

    homeSourceRankings.forEach((source) => {
      if (hasMappedSourceLogo(source.sourceName)) {
        featuredSourceMap.set(source.sourceName, source);
      }
    });

    FEATURED_SOURCE_NAMES.forEach((sourceName) => {
      if (!featuredSourceMap.has(sourceName) && hasMappedSourceLogo(sourceName)) {
        featuredSourceMap.set(sourceName, {
          sourceName,
          likes: 0,
          heartedByCurrentUser: false,
        });
      }
    });

    return [...featuredSourceMap.values()]
      .sort((left, right) => {
        if (right.likes !== left.likes) {
          return right.likes - left.likes;
        }

        const leftCuratedIndex = FEATURED_SOURCE_NAMES.indexOf(
          left.sourceName as (typeof FEATURED_SOURCE_NAMES)[number]
        );
        const rightCuratedIndex = FEATURED_SOURCE_NAMES.indexOf(
          right.sourceName as (typeof FEATURED_SOURCE_NAMES)[number]
        );
        const normalizedLeftIndex =
          leftCuratedIndex === -1 ? FEATURED_SOURCE_NAMES.length : leftCuratedIndex;
        const normalizedRightIndex =
          rightCuratedIndex === -1 ? FEATURED_SOURCE_NAMES.length : rightCuratedIndex;

        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex;
        }

        return left.sourceName.localeCompare(right.sourceName);
      })
      .slice(0, 12);
  }, [homeSourceRankings]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const getCategorySwipeArtStyle = useCallback(
    (category: string, index: number) => {
      const imageUrl = getCategoryImageUrl(category);

      return {
        backgroundImage: imageUrl
          ? `linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.02)), url(${imageUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: imageUrl ? undefined : undefined,
      } as const;
    },
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
          <div className="article-card-visual-content article-card-visual-content-brand-fill">
            <span className="article-card-visual-brand article-card-visual-brand-fill">
              <SourceBadge
                sourceName={safeSourceName}
                className="article-card-source-fill-badge"
                showInitialFallback={false}
              />
            </span>
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
          onContextMenu={(event) => {
            event.preventDefault();
            openLongPressMenu(article);
          }}
          onTouchStart={() => {
            clearArticleLongPressTimer();
            articleLongPressTimerRef.current = window.setTimeout(() => {
              openLongPressMenu(article);
            }, 420);
          }}
          onTouchEnd={clearArticleLongPressTimer}
          onTouchCancel={clearArticleLongPressTimer}
          onTouchMove={clearArticleLongPressTimer}
        >
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              {sortMode === "local" ? (
                <div className="trending-source-brand trending-source-brand-static">
                  <SourceHeaderMark
                    sourceName={safeSourceName}
                    className="trending-source-header-mark"
                    fallbackMode="text"
                  />
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
                    <SourceHeaderMark
                      sourceName={safeSourceName}
                      className="trending-source-header-mark"
                      fallbackMode="text"
                    />
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
            <span className="trending-published-date news-card-footer-date feed-meta-inline">
              <span>{publishedLabel}</span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                </svg>
                <span>{article.likes}</span>
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                </svg>
                <span>{article.comments.length}</span>
              </span>
            </span>
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
                <span className="trending-source-name">{getDisplaySourceLabel(article)}</span>
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
            <span className="trending-published-date feed-meta-inline">
              <span>
                {options?.showFreshnessTime
                  ? formatFreshnessTime(article.publishedAt, article.time)
                  : formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                </svg>
                <span>{article.likes}</span>
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                </svg>
                <span>{article.comments.length}</span>
              </span>
            </span>
          </div>
        </article>
      );
    }
  };

  const renderQuickWatchRow = (compact = false) => {
    if (myNewsQuickWatchVideos.length === 0) {
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
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
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
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
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

  const renderMyNewsCategoryVideosRow = (category: string, categoryVideos: VideoItem[]) => {
    if (categoryVideos.length === 0) {
      return null;
    }

    const label = `${getCategoryLabel(category)} Videos`;
    const normalizedCategoryKey = category.toLowerCase().replace(/\s+/g, "-");

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{label}</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label={label}>
          {categoryVideos.map((video) => (
            <div
              key={`mynews-category-video-${normalizedCategoryKey}-${video.id}`}
              className="quick-watch-item"
              role="listitem"
            >
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(
                    `mynews-category-${normalizedCategoryKey}:${video.id}`
                  ) && !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[
                    `mynews-category-${normalizedCategoryKey}:${video.id}`
                  ] = node;
                }}
                autoplayKey={`mynews-category-${normalizedCategoryKey}:${video.id}`}
                previewDurationMs={null}
                label={label}
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const scrollSectionIntoView = (sectionRef: RefObject<HTMLElement | null>) => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const renderAddMoreCategoriesRow = () => {
    const availableCategories = CATEGORY_OPTIONS.filter((category) => !categories.includes(category)).slice(
      0,
      10
    );

    if (availableCategories.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Add More Categories</strong>
            <span className="muted">Tap categories to expand your personalized feed.</span>
          </div>
        </div>

        <div className="category-swipe-row" role="list" aria-label="Add more categories">
          {availableCategories.map((category, index) => (
            <button
              key={`mynews-extra-${category}`}
              type="button"
              role="listitem"
              className="category-swipe-card"
              onClick={() => void handleQuickToggleCategory(category)}
              disabled={isSavingCategories}
            >
              <span
                className={`category-swipe-card-art category-art-${index % 8}`}
                style={getCategorySwipeArtStyle(category, index)}
                aria-hidden="true"
              />
              <span className="category-swipe-card-label">{getCategoryLabel(category)}</span>
              <span className="category-swipe-card-meta">
                {userId ? "Tap to add" : "Log in to add"}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedStoriesRow = () => {
    const rowArticles = myNewsFeaturedArticles;

    if (rowArticles.length === 0) {
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
          {rowArticles.map((article) => {
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

  const renderBreakingNewsRow = () => {
    if (breakingNewsPreviewArticles.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title breaking-news-title">
              Breaking News
            </strong>
          </div>
        </div>
        <div className="stack home-section-list" role="list" aria-label="Breaking news">
          {breakingNewsPreviewArticles.map((article) => (
            <div
              key={`breaking-${article.id || article.url || getArticleDeduplicationKey(article)}`}
              role="listitem"
            >
              {renderArticleFeedCard(article)}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderNewsClipsRow = () => {
    if (primaryNewsClipVideos.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">News Clips</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
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
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
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
      return (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Featured Video</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
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
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`featured-videos:${video.id}`] = node;
                }}
                autoplayKey={`featured-videos:${video.id}`}
                previewDurationMs={null}
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
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`featured-videos:${video.id}`] = node;
                }}
                autoplayKey={`featured-videos:${video.id}`}
                previewDurationMs={null}
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

  const renderSportsScoreRow = (
    games: SportsScoreGame[],
    leagueLabel: string,
    emptyLabel = "Scores unavailable right now."
  ) => {
    if (games.length === 0) {
      return (
        <div className="empty-state compact-empty-state">
          <strong>{emptyLabel}</strong>
          <span>Check back shortly for live, upcoming, and recent games.</span>
        </div>
      );
    }

    return (
      <div className="sports-scores-scroll" role="list" aria-label={`${leagueLabel} scores`}>
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            className="sports-score-card sports-score-card-button"
            role="listitem"
            onClick={() => setSelectedSportsGame(game)}
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
          </button>
        ))}
      </div>
    );
  };

  const renderSportsGameDetailModal = () => {
    if (!selectedSportsGame) {
      return null;
    }

    return (
      <div
        className="source-sheet-overlay"
        role="presentation"
        onClick={() => setSelectedSportsGame(null)}
      >
        <div
          className="bottom-sheet source-sheet sports-game-detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sports-game-detail-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-handle" />
          <div className="bottom-sheet-header source-sheet-header">
            <div className="stack" style={{ gap: "6px" }}>
              <strong id="sports-game-detail-title" className="bottom-sheet-title">
                {selectedSportsGame.awayTeam.name} at {selectedSportsGame.homeTeam.name}
              </strong>
              <span className="muted">{selectedSportsGame.league} game detail</span>
            </div>
            <button
              type="button"
              className="icon-button source-sheet-close"
              onClick={() => setSelectedSportsGame(null)}
              aria-label="Close game detail"
            >
              ×
            </button>
          </div>

          <div className="sports-game-detail-scoreboard">
            <div className="sports-game-detail-team-row">
              <div className="sports-game-detail-team-copy">
                {renderScoreTeamMark(selectedSportsGame.awayTeam, "sports-game-detail-team-mark")}
                <strong>{selectedSportsGame.awayTeam.name}</strong>
              </div>
              <strong className="sports-game-detail-score">{selectedSportsGame.awayTeam.score ?? "—"}</strong>
            </div>
            <div className="sports-game-detail-team-row">
              <div className="sports-game-detail-team-copy">
                {renderScoreTeamMark(selectedSportsGame.homeTeam, "sports-game-detail-team-mark")}
                <strong>{selectedSportsGame.homeTeam.name}</strong>
              </div>
              <strong className="sports-game-detail-score">{selectedSportsGame.homeTeam.score ?? "—"}</strong>
            </div>
          </div>

          <div className="sports-game-detail-meta">
            <span className={`sports-score-status sports-score-status-${selectedSportsGame.status.toLowerCase()}`}>
              {selectedSportsGame.status}
            </span>
            <span>{selectedSportsGame.statusDetail ?? selectedSportsGame.shortDetail ?? "Status unavailable"}</span>
            <span>
              {selectedSportsGame.scheduledAt
                ? new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(selectedSportsGame.scheduledAt))
                : "Scheduled time unavailable"}
            </span>
            {selectedSportsGame.venue ? <span>{selectedSportsGame.venue}</span> : null}
          </div>

          <div className="sports-game-detail-section">
            <strong>Box Score</strong>
            <span>
              {selectedSportsGame.boxScoreAvailable
                ? "Box score available."
                : "Box score/play-by-play unavailable for this game."}
            </span>
          </div>
          <div className="sports-game-detail-section">
            <strong>Play-by-Play</strong>
            <span>
              {selectedSportsGame.playByPlayAvailable
                ? "Play-by-play available."
                : "Box score/play-by-play unavailable for this game."}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderSportsLeagueVideos = (
    sectionKey: SportsSectionKey,
    label: string,
    leagueVideos: VideoItem[]
  ) => {
    if (leagueVideos.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">{label}</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{label}</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label={`${label} videos`}>
          {leagueVideos.map((video, index) => (
            <div key={`${sectionKey}-video-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  (autoplayTrendingVideoKeys.includes(
                    `sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`
                  ) ||
                    (sectionKey === "MORE" && isMoreSportsVideosVisible && index === 0)) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "sports")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`] = node;
                }}
                autoplayKey={`sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`}
                previewDurationMs={null}
                label={label}
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

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
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
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
                ref={(node) => {
                  teamPickerPanelRefs.current[league] = node;
                }}
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
      <article
        className="top-trending-list-card"
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
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
          <div className="top-trending-list-rank" aria-hidden="true">
            {rank}
          </div>
          <div className="top-trending-list-copy">
            <div className="top-trending-list-meta">
              <SourceHeaderMark
                sourceName={safeSourceName}
                className="top-trending-list-source-mark"
                fallbackMode="text"
              />
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                  </svg>
                  <span>{article.likes}</span>
                </span>
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                  </svg>
                  <span>{article.comments.length}</span>
                </span>
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
            ) : (
              <div className="top-trending-list-logo-fallback top-trending-list-category-fallback">
                <span className="top-trending-list-fallback-label">
                  {getCategoryLabel(getSafeCategoryLabel(article.category, article))}
                </span>
              </div>
            )}
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
    const safeCategoryName = getSafeCategoryLabel(article.category, article);
    const selectedImage = getBestArticleImage(article);
    const shouldUseImage =
      Boolean(selectedImage.src) &&
      isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);

    return (
      <article
        className={`top-trending-list-card ${
          typeof options?.showRank === "number" ? "top-trending-list-card-ranked" : ""
        } ${options?.className ?? ""}`.trim()}
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
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
              <SourceHeaderMark
                sourceName={safeSourceName}
                className="top-trending-list-source-mark"
                fallbackMode="text"
              />
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                  </svg>
                  <span>{article.likes}</span>
                </span>
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                  </svg>
                  <span>{article.comments.length}</span>
                </span>
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
            ) : (
              <div
                className={`top-trending-list-logo-fallback top-trending-list-category-fallback top-trending-list-category-fallback-${safeCategoryName.toLowerCase()}`}
              >
                <span className="top-trending-list-fallback-label">
                  {options?.imageFallbackLabel ?? getCategoryLabel(safeCategoryName)}
                </span>
              </div>
            )}
          </div>
        </Link>
      </article>
    );
  };

  const renderHomeTopNavigation = (
    activeMode:
      | "trending"
      | "mynews"
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
          ref={(node) => {
            topTabButtonRefs.current.trending = node;
          }}
          className={`toolbar-pill ${activeMode === "trending" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("trending")}
        >
          Trending
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.mynews = node;
          }}
          className={`toolbar-pill ${activeMode === "mynews" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("mynews")}
        >
          My News
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.local = node;
          }}
          className={`toolbar-pill ${activeMode === "local" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("local")}
        >
          Local
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.sports = node;
          }}
          className={`toolbar-pill ${activeMode === "sports" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("sports")}
        >
          Sports
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.celebrity = node;
          }}
          className={`toolbar-pill ${activeMode === "celebrity" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("celebrity")}
        >
          Celebrity
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.weather = node;
          }}
          className={`toolbar-pill ${activeMode === "weather" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("weather")}
        >
          Weather
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.technology = node;
          }}
          className={`toolbar-pill ${activeMode === "technology" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("technology")}
        >
          Technology
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.travel = node;
          }}
          className={`toolbar-pill ${activeMode === "travel" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("travel")}
        >
          Travel
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.food = node;
          }}
          className={`toolbar-pill ${activeMode === "food" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("food")}
        >
          Food
        </button>
        <button
          ref={(node) => {
            topTabButtonRefs.current.business = node;
          }}
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
      sortMode === "mynews" ||
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
            : sortMode === "mynews"
              ? "mynews"
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
                  : sortMode === "mynews"
                    ? "My News"
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

        {renderBreakingNewsRow()}

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

        {renderFeaturedVideosBreak()}

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
                <span className="home-weather-city">
                  {weatherPageCard?.cityLabel ?? selectedWeatherLocation ?? selectedLocalCity ?? localLocationLabel}
                </span>
                <div className="home-weather-temp-row">
                  <span className="home-weather-icon-shell">
                    {renderWeatherConditionIcon((weatherPageCard ?? weatherCard)?.weatherLabel)}
                  </span>
                  <strong className="home-weather-temp">
                    {weatherPageCard ?? weatherCard
                      ? `${Math.round((weatherPageCard ?? weatherCard)?.temperature ?? 0)}°`
                      : "—"}
                  </strong>
                </div>
                <span className="muted">
                  {weatherPageCard ?? weatherCard
                    ? (weatherPageCard ?? weatherCard)?.weatherLabel
                    : isWeatherPageLoading || isWeatherLoading
                      ? "Loading forecast..."
                      : "Forecast unavailable"}
                </span>
              </div>
              <div className="stack home-weather-meta" style={{ gap: "6px" }}>
                <span className="muted">
                  {(weatherPageCard ?? weatherCard)?.windMph
                    ? `Wind ${Math.round((weatherPageCard ?? weatherCard)?.windMph ?? 0)} mph`
                    : "Local outlook"}
                </span>
              </div>
            </div>

            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Enter a major city"
                  value={weatherSearchDraft}
                  onFocus={() => setIsLocalAutocompleteOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setIsLocalAutocompleteOpen(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setWeatherSearchDraft(event.target.value);
                    setIsLocalAutocompleteOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsLocalAutocompleteOpen(false);
                      handleUpdateWeatherLocation();
                    }
                  }}
                />
                {isLocalAutocompleteOpen && weatherCitySuggestions.length > 0 ? (
                  <div
                    className="local-city-dropdown"
                    role="listbox"
                    aria-label="Suggested cities"
                  >
                    {weatherCitySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="local-city-dropdown-item"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setWeatherSearchDraft(city);
                          setSelectedWeatherLocation(city);
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
                  handleUpdateWeatherLocation();
                }}
              >
                Update
              </button>
            </div>

            {weatherForecastDays.length > 0 ? (
              <div className="quick-watch-row">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">10-Day Forecast</strong>
                  </div>
                </div>
                <div className="weather-forecast-scroll" role="list" aria-label="10-day weather forecast">
                  {weatherForecastDays.map((day) => (
                    <div
                      key={`trending-forecast-${day.label}-${day.dateLabel}`}
                      className="weather-forecast-item"
                      role="listitem"
                    >
                      <article className="section-card weather-forecast-card">
                        <div className="stack" style={{ gap: "4px", alignItems: "center", textAlign: "center" }}>
                          <strong>{day.label}</strong>
                          <span className="muted">{day.dateLabel}</span>
                          <span className="home-weather-icon-shell weather-forecast-icon">
                            {renderWeatherConditionIcon(day.weatherLabel)}
                          </span>
                          <strong>{day.highTemp !== null ? `${Math.round(day.highTemp)}°` : "—"}</strong>
                          <span className="muted">
                            {day.lowTemp !== null ? `${Math.round(day.lowTemp)}° low` : "Low unavailable"}
                          </span>
                          <span className="muted weather-forecast-label">{day.weatherLabel}</span>
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isWeatherNewsLoading ? <p className="settings-detail-note">Loading weather stories...</p> : null}

            {weatherNewsArticles.length === 0 && !isWeatherNewsLoading ? (
              <div className="empty-state compact-empty-state">
                <strong>No weather stories for {selectedLocalCity ?? "this city"} right now.</strong>
                <span>Try another supported city or check back shortly.</span>
              </div>
            ) : (
              <div className="stack" style={{ gap: "18px" }}>
                {trendingWeatherSections.localWeather.length > 0 ? (
                  <section className="home-section-block home-section-plain">
                    <div className="home-section-header">
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong className="profile-section-title home-section-title">Local Weather</strong>
                      </div>
                    </div>
                    <div className="stack home-section-list top-trending-card-rail weather-story-list">
                      {trendingWeatherSections.localWeather.map((article) => (
                        <div key={`trending-local-weather-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                          {renderCompactSideImageArticle(article, {
                            className: "weather-compact-card",
                            imageFallbackLabel: "Local Weather",
                          })}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {trendingWeatherSections.nationalWeather.length > 0 ? (
                  <section className="home-section-block home-section-plain">
                    <div className="home-section-header">
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong className="profile-section-title home-section-title">National Weather</strong>
                      </div>
                    </div>
                    <div className="stack home-section-list top-trending-card-rail weather-story-list">
                      {trendingWeatherSections.nationalWeather.map((article) => (
                        <div key={`trending-national-weather-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                          {renderCompactSideImageArticle(article, {
                            className: "weather-compact-card",
                            imageFallbackLabel: "National Weather",
                          })}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
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
              <strong className="profile-section-title home-section-title">Featured Sources</strong>
              <span className="muted">Popular source profiles to explore right now.</span>
            </div>
          </div>

          {featuredSources.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No featured sources yet</strong>
              <span>Check back shortly as more sources gain momentum.</span>
            </div>
          ) : (
            <div className="source-rankings-carousel" role="list" aria-label="Featured sources">
              {featuredSources.map((source) => (
                <Link
                  key={`featured-source-${source.sourceName}`}
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
                    style={getCategorySwipeArtStyle(category, index)}
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
              <strong className="profile-section-title home-section-title">Food</strong>
            </div>
          </div>

          {foodTabArticles.length === 0 ? (
            isFoodPreviewLoading ? (
              <div className="muted">Loading food stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No food stories yet</strong>
                <span>Check back shortly for fresh food coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list">
              {foodTabArticles.slice(0, 6).map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
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

  if (sortMode === "mynews") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("mynews")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">My News</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {!userId ? (
            <div className="empty-state compact-empty-state">
              <strong>Log in to personalize My News</strong>
              <span>Follow categories and sources to build your own feed here.</span>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSortMode("trending")}
              >
                Browse Trending
              </button>
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>Choose categories for My News</strong>
              <span>Add categories to build a personalized feed, or keep Trending for a balanced mix.</span>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={openCategorySheet}>
                  Add categories
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setSortMode("trending")}
                >
                  See Trending
                </button>
              </div>
            </div>
          ) : isCategorySectionLoading ? (
            <div className="muted">Loading your selected categories...</div>
          ) : myNewsCategorySections.filter(
              (section) => section.category !== "Recommended for You" && section.articles.length > 0
            ).length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No stories matched your selected categories yet.</strong>
              <span>Try adding more categories or check back shortly.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: "22px" }}>
              {myNewsCategorySections
                .filter((section) => section.category !== "Recommended for You")
                .map((section, index, filteredSections) => (
                  <div key={`mynews-section-wrap-${section.category}`} className="stack" style={{ gap: "18px" }}>
                    <section
                      key={`mynews-section-${section.category}`}
                      className="home-section-block home-section-plain"
                    >
                      <div className="home-section-header">
                        <div className="stack" style={{ gap: "4px" }}>
                          <strong className="profile-section-title home-section-title">
                            {getCategoryLabel(section.category)}
                          </strong>
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

                    {renderMyNewsCategoryVideosRow(
                      section.category,
                      myNewsCategoryVideoSections[section.category] ?? []
                    )}

                    {index < filteredSections.length - 1 && index % 2 === 0
                      ? renderAddMoreCategoriesRow()
                      : null}
                  </div>
                ))}

              {myNewsCategorySections.find((section) => section.category === "Recommended for You")?.articles
                .length ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">
                        Recommended for You
                      </strong>
                    </div>
                  </div>
                  <div className="stack home-section-list">
                    {(
                      myNewsCategorySections.find(
                        (section) => section.category === "Recommended for You"
                      )?.articles ?? []
                    ).map((article) => (
                      <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                        {renderArticleFeedCard(article)}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </section>
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
              <strong className="profile-section-title home-section-title sports-page-title">
                Sports
              </strong>
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
                    <strong className="profile-section-title sports-subsection-title">
                      Your Teams
                    </strong>
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
                    <span>No updates yet for your teams.</span>
                  </div>
                ) : (
                  <div className="favorite-team-updates-row" role="list" aria-label="Favorite team updates">
                    {favoriteTeamUpdates.map(({ team, article, game }) => (
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
                            : game
                              ? `${game.awayTeam.name} ${game.awayTeam.score ?? "—"} at ${game.homeTeam.name} ${game.homeTeam.score ?? "—"}`
                              : "No updates yet for your teams."}
                        </p>
                        {game ? (
                          <span className="favorite-team-update-meta">
                            {game.status} · {game.shortDetail ?? "Game update"}
                          </span>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Current Games</strong>
                    <span className="muted">Live and upcoming matchups for the leagues you follow.</span>
                  </div>
                </div>

                {isSportsScoresLoading ? (
                  <div className="muted">Loading current games...</div>
                ) : (
                  renderSportsScoreRow(
                    favoriteTeamGames.length > 0 ? favoriteTeamGames : topSportsGames,
                    "Favorite team current games",
                    "Scores unavailable right now."
                  )
                )}
              </section>

              {sportsFeaturedArticles.length > 0 ? (
                <section className="home-section-block home-section-plain featured-stories-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Featured Sports</strong>
                    </div>
                  </div>
                  <div className="featured-stories-scroll" role="list" aria-label="Featured sports stories">
                    {sportsFeaturedArticles.map((article) => {
                      const articleRouteId = getArticleRouteId(article);
                      const imageSrc = getBestArticleImage(article).src;

                      if (!articleRouteId) {
                        return null;
                      }

                      return (
                        <Link
                          key={`featured-sports-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                          href={`/article/${articleRouteId}/`}
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
              ) : null}

              {sportsLeagueSections.map((section) => (
                <section
                  key={`sports-section-${section.key}`}
                  className="home-section-block home-section-plain"
                >
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong
                        className={`profile-section-title ${
                          section.key === "MORE"
                            ? "home-section-title sports-more-title"
                            : "sports-subsection-title"
                        }`}
                      >
                        {section.label}
                      </strong>
                    </div>
                  </div>

                  {section.scoreLeague ? (
                    isSportsScoresLoading ? (
                      <div className="muted">Loading {section.label} scores...</div>
                    ) : (
                      renderSportsScoreRow(section.scores.slice(0, 6), `${section.label} scores`)
                    )
                  ) : null}

                  {section.articles.length > 0 ? (
                    <div className="stack home-section-list top-trending-card-rail sports-league-compact-list">
                      {section.articles.map((article) => (
                        <div
                          key={`sports-section-article-${section.key}-${
                            article.id || article.url || getArticleDeduplicationKey(article)
                          }`}
                        >
                          {renderCompactSideImageArticle(article, {
                            className: "sports-league-compact-card",
                            imageFallbackLabel: section.label,
                          })}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {renderSportsLeagueVideos(
                    section.key,
                    section.key === "NFL"
                      ? "Quick Watch"
                      : section.key === "MORE"
                        ? "More Videos"
                        : `${section.label} Quick Watch`,
                    section.videos
                  )}
                </section>
              ))}

              {favoriteTeams.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Your Team News</strong>
                    </div>
                  </div>
                  {favoriteTeamNewsArticles.length === 0 ? (
                    <div className="empty-state compact-empty-state">
                      <strong>No updates yet for your teams.</strong>
                    </div>
                  ) : (
                    <div className="stack home-section-list top-trending-card-rail sports-league-compact-list">
                      {favoriteTeamNewsArticles.map((article) => (
                        <div
                          key={`favorite-team-news-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                        >
                          {renderCompactSideImageArticle(article, {
                            className: "sports-league-compact-card",
                            imageFallbackLabel: "Your Team",
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          )}
        </section>
        {renderSportsGameDetailModal()}
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
              {featuredCelebrityArticles.length > 0 ? (
                <section className="home-section-block home-section-plain featured-stories-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">
                        Featured Celebrity
                      </strong>
                    </div>
                  </div>
                  <div className="featured-stories-scroll" role="list" aria-label="Featured celebrity stories">
                    {featuredCelebrityArticles.map((article) => {
                      const articleRouteId = getArticleRouteId(article);
                      const imageSrc = getBestArticleImage(article).src;

                      if (!articleRouteId) {
                        return null;
                      }

                      return (
                        <Link
                          key={`featured-celebrity-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                          href={`/article/${articleRouteId}/`}
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
              ) : null}

              {celebritySectionContent.movies.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Movies</strong>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail">
                    {celebritySectionContent.movies.map((article) => (
                      <div key={`celeb-movies-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, { imageFallbackLabel: "Movies" })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {celebritySectionContent.music.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Music</strong>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail">
                    {celebritySectionContent.music.map((article) => (
                      <div key={`celeb-music-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, { imageFallbackLabel: "Music" })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {celebritySectionContent.tvShows.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">TV Shows</strong>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail">
                    {celebritySectionContent.tvShows.map((article) => (
                      <div key={`celeb-tv-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, { imageFallbackLabel: "TV" })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {celebritySectionContent.gossip.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Gossip</strong>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail">
                    {celebritySectionContent.gossip.map((article) => (
                      <div key={`celeb-gossip-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, { imageFallbackLabel: "Gossip" })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="home-section-block home-section-plain quick-watch-row">
                <div className="home-section-header">
                  <strong className="profile-section-title home-section-title">Celebrity Videos</strong>
                </div>
                {celebrityPageVideos.length > 0 ? (
                  <div className="quick-watch-scroll" role="list" aria-label="Celebrity videos">
                    {celebrityPageVideos.map((video) => (
                      <div key={`celeb-video-${video.id}`} className="quick-watch-item" role="listitem">
                        <VideoFeedCard
                          video={video}
                          isAutoplaying={
                            autoplayTrendingVideoKeys.includes(`celebrity-videos:${video.id}`) &&
                            !video.fallback
                          }
                          onToggleLike={handleToggleVideoLike}
                          onToggleSave={handleToggleVideoSave}
                          onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                          onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "celebrity")}
                          frameRef={(node) => {
                            trendingVideoFrameRefs.current[`celebrity-videos:${video.id}`] = node;
                          }}
                          autoplayKey={`celebrity-videos:${video.id}`}
                          previewDurationMs={4000}
                          label="Celebrity Video"
                          hideActions
                          useRelativeTime
                          className="video-card-inline quick-watch-video-card"
                          variant="article"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact-empty-state">
                    <strong>Videos loading…</strong>
                  </div>
                )}
              </section>
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

          <div className="section-card stack local-feed-shell local-search-card">
            <div className="local-feed-top-row">
              <span className="local-feed-selected-label">
                {(weatherPageCard?.cityLabel ?? selectedWeatherLocation) || "Weather search"}
              </span>
            </div>
            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Search city or zip"
                  value={weatherSearchDraft}
                  onChange={(event) => setWeatherSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleUpdateWeatherLocation();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="button button-secondary local-feed-button"
                onClick={handleUpdateWeatherLocation}
              >
                Update
              </button>
            </div>
            <div className="home-weather-card">
              <div className="stack" style={{ gap: "4px" }}>
                <span className="home-weather-city">
                  {(weatherPageCard?.cityLabel ?? selectedWeatherLocation) || "Weather"}
                </span>
                <div className="home-weather-temp-row">
                  <span className="home-weather-icon-shell">
                    {renderWeatherConditionIcon(weatherPageCard?.weatherLabel)}
                  </span>
                  <strong className="home-weather-temp">
                    {weatherPageCard ? `${Math.round(weatherPageCard.temperature)}°` : "—"}
                  </strong>
                </div>
                <span className="muted">
                  {weatherPageCard
                    ? weatherPageCard.weatherLabel
                    : isWeatherPageLoading
                    ? "Loading current conditions..."
                    : "Forecast unavailable"}
                </span>
              </div>
              <div className="stack home-weather-meta" style={{ gap: "6px" }}>
                <span className="muted">
                  {weatherPageCard &&
                  weatherPageCard.highTemp !== null &&
                  weatherPageCard.highTemp !== undefined &&
                  weatherPageCard.lowTemp !== null &&
                  weatherPageCard.lowTemp !== undefined
                    ? `H ${Math.round(weatherPageCard.highTemp ?? 0)}° / L ${Math.round(
                        weatherPageCard.lowTemp ?? 0
                      )}°`
                    : "Daily outlook"}
                </span>
                <span className="muted">
                  {weatherPageCard?.windMph ? `Wind ${Math.round(weatherPageCard.windMph)} mph` : "Wind unavailable"}
                </span>
                <span className="muted">
                  {weatherPageCard?.humidity !== null && weatherPageCard?.humidity !== undefined
                    ? `Humidity ${Math.round(weatherPageCard.humidity)}%`
                    : "Humidity unavailable"}
                </span>
              </div>
            </div>

            {weatherForecastDays.length > 0 ? (
              <div className="quick-watch-row">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">10-Day Forecast</strong>
                  </div>
                </div>
                <div className="weather-forecast-scroll" role="list" aria-label="10-day weather forecast">
                  {weatherForecastDays.map((day) => (
                    <div
                      key={`forecast-${day.label}-${day.dateLabel}`}
                      className="weather-forecast-item"
                      role="listitem"
                    >
                      <article className="section-card weather-forecast-card">
                        <div className="stack" style={{ gap: "4px", alignItems: "center", textAlign: "center" }}>
                          <strong>{day.label}</strong>
                          <span className="muted">{day.dateLabel}</span>
                          <span className="home-weather-icon-shell weather-forecast-icon">
                            {renderWeatherConditionIcon(day.weatherLabel)}
                          </span>
                          <strong>{day.highTemp !== null ? `${Math.round(day.highTemp)}°` : "—"}</strong>
                          <span className="muted">
                            {day.lowTemp !== null ? `${Math.round(day.lowTemp)}° low` : "Low unavailable"}
                          </span>
                          <span className="muted weather-forecast-label">{day.weatherLabel}</span>
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
            ) : weatherForecastError && !isWeatherPageLoading ? (
              <div className="status-message status-error">{weatherForecastError}</div>
            ) : null}
          </div>

          {weatherTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No weather stories yet</strong>
              <span>Check back shortly for fresh weather coverage.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: "20px" }}>
              {weatherSectionContent.severeWeather.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Severe Weather</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.severeWeather.map((article) => (
                      <div key={`weather-severe-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Severe",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="home-section-block home-section-plain quick-watch-row">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Weather Videos</strong>
                  </div>
                </div>
                {weatherPageVideos.length > 0 ? (
                  <div className="quick-watch-scroll" role="list" aria-label="Weather videos">
                    {weatherPageVideos.map((video) => (
                      <div key={`weather-video-${video.id}`} className="quick-watch-item" role="listitem">
                        <VideoFeedCard
                          video={video}
                          isAutoplaying={
                            autoplayTrendingVideoKeys.includes(`weather-videos:${video.id}`) && !video.fallback
                          }
                          onToggleLike={handleToggleVideoLike}
                          onToggleSave={handleToggleVideoSave}
                          onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                          onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                          frameRef={(node) => {
                            trendingVideoFrameRefs.current[`weather-videos:${video.id}`] = node;
                          }}
                          autoplayKey={`weather-videos:${video.id}`}
                          previewDurationMs={null}
                          label="Weather Video"
                          hideActions
                          useRelativeTime
                          className="video-card-inline quick-watch-video-card"
                          variant="article"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact-empty-state">
                    <strong>Videos loading…</strong>
                  </div>
                )}
              </section>

              {weatherSectionContent.localWeather.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Local Weather</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.localWeather.map((article) => (
                      <div key={`weather-local-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Local Weather",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">National Weather Map</strong>
                  </div>
                </div>
                <div
                  className="section-card stack weather-map-placeholder-card weather-map-launch-surface"
                  role={nationalWeatherMapEmbedHtml ? "button" : undefined}
                  tabIndex={nationalWeatherMapEmbedHtml ? 0 : -1}
                  onClick={() => {
                    if (nationalWeatherMapFullscreenHtml) {
                      setIsWeatherRadarOpen(true);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!nationalWeatherMapFullscreenHtml) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setIsWeatherRadarOpen(true);
                    }
                  }}
                >
                  {nationalWeatherMapEmbedHtml ? (
                    <>
                      <iframe
                        title="National U.S. weather radar map"
                        srcDoc={nationalWeatherMapEmbedHtml}
                        className="national-weather-map-frame"
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin"
                      />
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong>Current U.S. radar</strong>
                        <span className="muted">
                          Dark basemap with live RainViewer radar overlay across the U.S.
                        </span>
                        <span className="muted weather-map-card-hint">Tap to open fullscreen radar</span>
                      </div>
                      <a
                        href="https://radar.weather.gov/"
                        target="_blank"
                        rel="noreferrer"
                        className="button button-secondary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open NWS Radar
                      </a>
                    </>
                  ) : isNationalWeatherMapLoading ? (
                    <>
                      <strong>Loading national radar...</strong>
                      <span className="muted">
                        Pulling the latest U.S. radar frame.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Radar coming soon</strong>
                      <span className="muted">
                        RainViewer is unavailable right now. Open the national radar map from the National Weather Service.
                      </span>
                      <a
                        href="https://radar.weather.gov/"
                        target="_blank"
                        rel="noreferrer"
                        className="button button-secondary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open NWS Radar
                      </a>
                    </>
                  )}
                </div>
              </section>

              {weatherSectionContent.forecastRadar.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Forecast & Radar</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.forecastRadar.map((article) => (
                      <div key={`weather-forecast-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Forecast",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {weatherSectionContent.climateEnvironment.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Climate & Environment</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.climateEnvironment.map((article) => (
                      <div key={`weather-climate-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Climate",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
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
          <div className="category-swipe-row food-section-nav-row" role="list" aria-label="Food sections">
            {[
              {
                key: "recipes",
                label: "Recipes",
                meta: "Cooking picks",
                onClick: () => scrollSectionIntoView(foodRecipesSectionRef),
              },
              {
                key: "videos",
                label: "Recipe Videos",
                meta: "Watch & cook",
                onClick: () => scrollSectionIntoView(foodRecipeVideosSectionRef),
              },
              {
                key: "latest",
                label: "Food News",
                meta: "Latest stories",
                onClick: () => scrollSectionIntoView(foodLatestSectionRef),
              },
            ].map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="listitem"
                className="category-swipe-card food-section-nav-card"
                onClick={item.onClick}
              >
                <span
                  className={`category-swipe-card-art category-art-${index % 8}`}
                  style={getCategorySwipeArtStyle(item.label, index)}
                  aria-hidden="true"
                />
                <span className="category-swipe-card-label">{item.label}</span>
                <span className="category-swipe-card-meta">{item.meta}</span>
              </button>
            ))}
          </div>

          <section
            ref={foodRecipesSectionRef}
            className="home-section-block home-section-plain featured-stories-row food-recipes-row"
          >
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Recipes</strong>
                <span className="muted">Recipe-focused picks from cooking sources you know.</span>
              </div>
            </div>

            {foodSectionArticles.recipes.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>Recipes loading…</strong>
              </div>
            ) : (
              <div className="featured-stories-scroll" role="list" aria-label="Recipes">
                {foodSectionArticles.recipes.map((article) => {
                  const routeId = getArticleRouteId(article);
                  const selectedImage = getBestArticleImage(article);
                  const imageSrc = selectedImage.src;

                  if (!routeId) {
                    return null;
                  }

                  return (
                    <Link
                      key={`recipe-${routeId}`}
                      href={`/article/${routeId}/`}
                      className="featured-story-card food-recipe-card"
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
                      <div
                        className={`featured-story-overlay ${imageSrc ? "" : "featured-story-overlay-solid"}`}
                      />
                      <div className="featured-story-copy">
                        <span className="featured-story-source">
                          {getDisplaySourceLabel(article)}
                        </span>
                        <h3 className="featured-story-title">{cleanDisplayText(article.title)}</h3>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section
            ref={foodRecipeVideosSectionRef}
            className="home-section-block home-section-plain quick-watch-row"
          >
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Recipe Videos</strong>
              </div>
            </div>
            {foodPageVideos.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>Videos loading…</strong>
              </div>
            ) : (
              <div className="quick-watch-scroll" role="list" aria-label="Recipe videos">
                {foodPageVideos.map((video) => (
                  <div key={`food-videos-${video.id}`} className="quick-watch-item" role="listitem">
                    <VideoFeedCard
                      video={video}
                      isAutoplaying={
                        autoplayTrendingVideoKeys.includes(`food-recipes:${video.id}`) &&
                        !video.fallback
                      }
                      onToggleLike={handleToggleVideoLike}
                      onToggleSave={handleToggleVideoSave}
                      onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                      onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                      frameRef={(node) => {
                        trendingVideoFrameRefs.current[`food-recipes:${video.id}`] = node;
                      }}
                      autoplayKey={`food-recipes:${video.id}`}
                      previewDurationMs={null}
                      label="Recipe Video"
                      hideActions
                      useRelativeTime
                      className="video-card-inline quick-watch-video-card"
                      variant="article"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section ref={foodLatestSectionRef} className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Food News</strong>
              </div>
            </div>

            {foodSectionArticles.latest.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>No food stories yet</strong>
                <span>Check back shortly for fresh food coverage.</span>
              </div>
            ) : (
              <div className="stack home-section-list">
                {foodSectionArticles.latest.map((article) => (
                  <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                    {renderArticleFeedCard(article)}
                  </div>
                ))}
              </div>
            )}
          </section>
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

        {localSectionArticles.localSports.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Local Sports</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.localSports.map((article) => (
                <div key={`local-sports-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Local Sports",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localSectionArticles.developmentBusiness.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Development & Business</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.developmentBusiness.map((article) => (
                <div key={`local-development-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Business",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localSectionArticles.eventsThingsToDo.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Events & Things To Do</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.eventsThingsToDo.map((article) => (
                <div key={`local-events-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Events",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localSectionArticles.foodRestaurants.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Food & Restaurants</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.foodRestaurants.map((article) => (
                <div key={`local-food-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Food",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localVideoItems.length > 0 ? (
          <section className="home-section-block home-section-plain quick-watch-row">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Local Videos</strong>
              </div>
            </div>
            <div className="quick-watch-scroll" role="list" aria-label="Local videos">
              {localVideoItems.map((video) => (
                <div key={`local-video-${video.id}`} className="quick-watch-item" role="listitem">
                  <VideoFeedCard
                    video={video}
                    isAutoplaying={
                      autoplayTrendingVideoKeys.includes(`local-videos:${video.id}`) && !video.fallback
                    }
                    onToggleLike={handleToggleVideoLike}
                    onToggleSave={handleToggleVideoSave}
                    onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                    onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                    frameRef={(node) => {
                      trendingVideoFrameRefs.current[`local-videos:${video.id}`] = node;
                    }}
                    autoplayKey={`local-videos:${video.id}`}
                    previewDurationMs={null}
                    label="Local Videos"
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

      {isWeatherRadarOpen && nationalWeatherMapFullscreenHtml ? (
        <div
          className="weather-radar-fullscreen-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="National weather radar"
        >
          <div className="weather-radar-fullscreen">
            <div className="weather-radar-fullscreen-header">
              <button
                type="button"
                className="header-icon-button"
                onClick={() => setIsWeatherRadarOpen(false)}
                aria-label="Close radar"
              >
                <span className="header-icon-glyph" aria-hidden="true">
                  ✕
                </span>
              </button>
              <strong className="profile-section-title home-section-title">National Weather Map</strong>
              <div className="app-header-side-spacer" aria-hidden="true" />
            </div>
            <iframe
              title="Fullscreen national U.S. weather radar map"
              srcDoc={nationalWeatherMapFullscreenHtml}
              className="weather-radar-fullscreen-frame"
              loading="eager"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      ) : null}

      {longPressMenuArticle ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Article actions"
          onClick={() => setLongPressMenuArticle(null)}
        >
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 className="modal-title">Article actions</h3>
                <p className="muted bottom-sheet-title">
                  {cleanDisplayText(longPressMenuArticle.title)}
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setLongPressMenuArticle(null)}
              >
                Close
              </button>
            </div>

            <div className="stack" style={{ gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  await handleCardShare(longPressMenuArticle);
                  setLongPressMenuArticle(null);
                }}
              >
                Share
              </button>
              <button
                type="button"
                className="button button-accent"
                onClick={async () => {
                  await handleCardSave(longPressMenuArticle);
                  setLongPressMenuArticle(null);
                }}
              >
                {longPressMenuArticle.saved ? "Remove bookmark" : "Bookmark / Save"}
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
