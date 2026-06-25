"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-base";
import {
  consumePendingArticleReturnState,
  saveArticleReturnState,
} from "../../lib/article-navigation";
import { getArticleDisplayImage } from "../../lib/article-display-image";
import { createBlockedUser } from "../../lib/blocked-users";
import SourceBadge from "../components/source-badge";
import { getCategoryLabel, getDisplayCategory } from "../../lib/categories";
import { cleanDisplayText } from "../../lib/display-text";
import { handleArticleCardActivation } from "../../lib/open-article";
import { getProfileIdentity } from "../../lib/profile-identities";
import { ensureProfileRow, saveProfilePatch } from "../../lib/profile-store";
import { formatRelativeTimestamp } from "../../lib/relative-time";
import { slugifySourceName, sourceLogoMap } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";
import HeartIcon from "../components/heart-icon";

const SEARCH_PAGE_SIZE = 25;
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";

type NewsArticle = {
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
  thumbnail?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  provider?: string | null;
};

type UserProfileSearchResult = {
  id: string;
  user_id?: string | null;
  username: string | null;
  avatar_url: string | null;
  bio?: string | null;
  display_name?: string | null;
};

type BlockedUserRow = {
  blocker_id: string | null;
  blocked_id: string | null;
};

type SearchNewsResponse = {
  articles: NewsArticle[];
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type SourceRatingRow = {
  id: string;
  user_id: string;
  source_name: string;
  rating: "like" | "dislike";
};

const fallbackTrendingTerms = [
  "CNN",
  "Markets",
  "Artificial intelligence",
  "Elections",
  "Reuters",
  "World news",
  "Health policy",
  "Tech earnings",
  "Sports headlines",
  "Breaking news",
];

const TRUSTED_SEARCH_SOURCES = [
  "AP News",
  "Reuters",
  "BBC",
  "CNN",
  "NBC News",
  "ABC News",
  "CBS News",
  "NPR",
  "PBS",
  "The Guardian",
  "The New York Times",
  "New York Times",
  "Washington Post",
  "Wall Street Journal",
  "Bloomberg",
  "CNBC",
  "Forbes",
  "USA Today",
  "Axios",
  "Politico",
  "The Hill",
  "ESPN",
  "Yahoo Sports",
  "CBS Sports",
  "NBC Sports",
  "Variety",
  "Billboard",
  "Hollywood Reporter",
  "People",
  "The Weather Channel",
  "AccuWeather",
  "Scientific American",
  "Nature",
  "Space.com",
] as const;

type SearchTab = "articles" | "users";

const TITLE_STOP_WORDS = new Set([
  "after",
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "how",
  "in",
  "into",
  "is",
  "its",
  "new",
  "news",
  "of",
  "on",
  "over",
  "or",
  "says",
  "that",
  "the",
  "this",
  "to",
  "was",
  "with",
]);

const COMMON_SINGLE_TERM_BLOCKLIST = new Set([
  "after",
  "art",
  "be",
  "breaking",
  "has",
  "how",
  "its",
  "new",
  "news",
  "said",
  "says",
  "that",
  "this",
  "update",
  "was",
]);

const SOURCE_ALIASES: Record<string, string[]> = {
  CNN: ["cnn"],
  "BBC News": ["bbc", "bbc news"],
  "CBS News": ["cbs", "cbs news", "cbs news texas", "cbs new york", "cbs chicago", "cbs miami", "cbs los angeles"],
  "ABC News": ["abc", "abc news", "abc7ny", "abc7 chicago", "abc7 los angeles", "abc13 houston"],
  "NBC News": ["nbc", "nbc news", "nbc new york", "nbc chicago", "nbc los angeles", "nbc 6 south florida"],
  CNBC: ["cnbc"],
  Reuters: ["reuters"],
  NPR: ["npr"],
  Bloomberg: ["bloomberg"],
  Politico: ["politico"],
  Axios: ["axios"],
  "AP News": ["ap", "ap news", "associated press"],
  "Associated Press": ["ap", "ap news", "associated press"],
  "Fox News": ["fox", "fox news", "fox 32 chicago", "fox 11 los angeles", "fox 5 atlanta", "fox 26 houston", "fox 4 dallas"],
  "The Guardian": ["guardian", "the guardian"],
  "The Hill": ["the hill", "hill"],
};

function getSourceAliasTerms(sourceName: string | null | undefined) {
  const normalizedSource = cleanDisplayText(sourceName ?? "").trim();

  if (!normalizedSource) {
    return [];
  }

  const aliases = SOURCE_ALIASES[normalizedSource] ?? [];
  const baseAlias = normalizedSource.replace(/\s+news$/i, "").trim();

  return Array.from(
    new Set(
      [normalizedSource, baseAlias, ...aliases]
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function isTrustedSearchSource(sourceName: string | null | undefined) {
  const normalizedSource = cleanDisplayText(sourceName ?? "").trim().toLowerCase();

  if (!normalizedSource) {
    return false;
  }

  return TRUSTED_SEARCH_SOURCES.some((trustedSource) => {
    const normalizedTrustedSource = trustedSource.toLowerCase();

    return (
      normalizedSource === normalizedTrustedSource ||
      normalizedSource.includes(normalizedTrustedSource) ||
      normalizedTrustedSource.includes(normalizedSource)
    );
  });
}

function getSearchProviderLabel(provider: string | null | undefined) {
  const normalizedProvider = cleanDisplayText(provider ?? "").trim().toLowerCase();

  if (normalizedProvider === "gnews") {
    return "GNEWS";
  }

  if (normalizedProvider === "guardian") {
    return "GUARDIAN";
  }

  if (normalizedProvider === "nyt") {
    return "NYT";
  }

  if (normalizedProvider === "currents") {
    return "CURRENTS";
  }

  return "CURRENT";
}

function formatSearchDate(publishedAt?: string | null, fallback?: string) {
  return formatRelativeTimestamp(publishedAt, fallback);
}

function persistSearchArticleMetadata(article: NewsArticle) {
  if (typeof window === "undefined" || typeof article.id !== "number" || article.id <= 0) {
    return;
  }

  try {
    const cardImage = getArticleDisplayImage(article).src;
    const existingRaw = window.localStorage.getItem(ARTICLE_METADATA_STORAGE_KEY);
    const existingCache = existingRaw
      ? (JSON.parse(existingRaw) as Record<string, Record<string, unknown>>)
      : {};

    existingCache[String(article.id)] = {
      id: article.id,
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
    console.error("SEARCH ARTICLE METADATA CACHE WRITE FAILED", error);
  }
}

function getArticleTimestamp(article: NewsArticle) {
  if (!article.publishedAt) {
    return 0;
  }

  const timestamp = new Date(article.publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isArticleWithinDays(article: NewsArticle, days: number) {
  const timestamp = getArticleTimestamp(article);

  if (!timestamp) {
    return false;
  }

  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function formatSearchDateDetail(publishedAt?: string | null) {
  if (!publishedAt) {
    return "";
  }

  const timestamp = new Date(publishedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function tokenizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token));
}

function extractMeaningfulPhrases(title: string) {
  const rawWords = title
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const phrases: string[] = [];

  for (let start = 0; start < rawWords.length; start += 1) {
    for (let size = 4; size >= 2; size -= 1) {
      const words = rawWords.slice(start, start + size);

      if (words.length < 2) {
        continue;
      }

      const normalizedWords = words.map((word) => word.toLowerCase());

      if (normalizedWords.some((word) => TITLE_STOP_WORDS.has(word))) {
        continue;
      }

      const hasMeaningfulSignal = words.some((word) => {
        const lowerWord = word.toLowerCase();

        return (
          /\d/.test(word) ||
          (word[0] && word[0] === word[0].toUpperCase()) ||
          lowerWord.length > 5
        );
      });

      if (!hasMeaningfulSignal) {
        continue;
      }

      phrases.push(words.join(" "));
    }
  }

  return phrases;
}

function buildTrendingTerms(articles: NewsArticle[]) {
  const counts = new Map<string, number>();

  articles.forEach((article) => {
    const sourceTerm = article.source?.trim();

    if (sourceTerm) {
      counts.set(sourceTerm, (counts.get(sourceTerm) ?? 0) + 3);
    }

    extractMeaningfulPhrases(article.title).forEach((phrase, index) => {
      const weight = 6 - Math.min(index, 3);
      counts.set(phrase, (counts.get(phrase) ?? 0) + weight);
    });

    tokenizeSearchText(article.title).forEach((token, index) => {
      if (COMMON_SINGLE_TERM_BLOCKLIST.has(token)) {
        return;
      }

      const weight = index < 2 ? 2 : 1;
      counts.set(token, (counts.get(token) ?? 0) + weight);
    });

    tokenizeSearchText(article.description ?? "").forEach((token) => {
      if (COMMON_SINGLE_TERM_BLOCKLIST.has(token)) {
        return;
      }

      counts.set(token, (counts.get(token) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .filter(([term]) => {
      const normalized = term.trim().toLowerCase();

      if (!normalized) {
        return false;
      }

      if (normalized.split(" ").length === 1 && COMMON_SINGLE_TERM_BLOCKLIST.has(normalized)) {
        return false;
      }

      return normalized.length > 2;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) =>
      sourceLogoMap[term]
        ? term
        : term
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
    );
}

function getMatchScore(article: NewsArticle, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  const title = article.title.toLowerCase();
  const source = article.source.toLowerCase();
  const category = article.category.toLowerCase();
  const description = (article.description ?? "").toLowerCase();
  const content = (article.content ?? "").toLowerCase();

  if (title.includes(normalizedQuery)) score += 8;
  if (source.includes(normalizedQuery)) score += 10;
  if (category.includes(normalizedQuery)) score += 4;
  if (description.includes(normalizedQuery)) score += 3;
  if (content.includes(normalizedQuery)) score += 2;

  tokenizeSearchText(normalizedQuery).forEach((token) => {
    if (title.includes(token)) score += 4;
    if (source.includes(token)) score += 5;
    if (category.includes(token)) score += 2;
    if (description.includes(token)) score += 1.5;
    if (content.includes(token)) score += 1;
  });

  return score;
}

function sanitizeSourceName(value: string | null | undefined) {
  const cleaned = cleanDisplayText(value ?? "").replace(/\s+\d+(?:\.\d+)?$/, "").trim();

  if (
    !cleaned ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
  ) {
    return "News source";
  }

  return cleaned;
}

function dedupeSearchArticles(articles: NewsArticle[]) {
  const normalizeArticleUrl = (url?: string | null) => {
    if (!url?.trim()) {
      return "";
    }

    try {
      const parsed = new URL(url.trim());
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
      return url.trim().toLowerCase();
    }
  };

  const normalizeArticleTitle = (title: string) =>
    title
      .toLowerCase()
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const bestByKey = new Map<string, NewsArticle>();
  const getImageScore = (article: NewsArticle) =>
    Number(Boolean(article.urlToImage || article.imageUrl || article.image || article.mediaContent));

  const isBetterArticle = (candidate: NewsArticle, current: NewsArticle) => {
    const candidateTime = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0;
    const currentTime = current.publishedAt ? new Date(current.publishedAt).getTime() : 0;

    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }

    const candidateImageScore = getImageScore(candidate);
    const currentImageScore = getImageScore(current);

    if (candidateImageScore !== currentImageScore) {
      return candidateImageScore > currentImageScore;
    }

    return candidate.title.length > current.title.length;
  };

  articles.forEach((article) => {
    const normalizedUrl = normalizeArticleUrl(article.url);
    const normalizedTitle = normalizeArticleTitle(article.title);
    const sourceKey = sanitizeSourceName(article.source).toLowerCase();
    const keys = [
      normalizedUrl ? `url:${normalizedUrl}` : null,
      normalizedTitle ? `title:${sourceKey}:${normalizedTitle}` : null,
    ].filter(Boolean) as string[];

    if (keys.length === 0) {
      keys.push(`id:${article.id}`);
    }

    const existing = keys
      .map((key) => bestByKey.get(key))
      .find((value): value is NewsArticle => Boolean(value));
    const bestArticle = existing && !isBetterArticle(article, existing) ? existing : article;

    keys.forEach((key) => bestByKey.set(key, bestArticle));
  });

  return Array.from(new Set(bestByKey.values()));
}

function getSearchArticleRenderKey(article: NewsArticle, index: number) {
  const sourceKey = sanitizeSourceName(article.source) || "unknown";
  const normalizedUrl = article.url?.trim() ?? "";

  if (normalizedUrl) {
    return `${article.id}-${normalizedUrl}`;
  }

  return `${article.id}-${sourceKey}-${index}`;
}

function normalizeSearchPayload(payload: NewsArticle[] | SearchNewsResponse) {
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

export default function Search() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("articles");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [searchArticles, setSearchArticles] = useState<NewsArticle[]>([]);
  const [sourceFallbackArticles, setSourceFallbackArticles] = useState<NewsArticle[]>([]);
  const [userResults, setUserResults] = useState<UserProfileSearchResult[]>([]);
  const [trendingTerms, setTrendingTerms] = useState<string[]>(fallbackTrendingTerms);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [sourceRatings, setSourceRatings] = useState<SourceRatingRow[]>([]);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingMoreSearchResults, setIsLoadingMoreSearchResults] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [failedSearchImages, setFailedSearchImages] = useState<Record<string, boolean>>({});
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const loadMoreSearchSentinelRef = useRef<HTMLDivElement | null>(null);
  const resultsAreaRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextSearchPageRef = useRef(false);
  const searchBootstrapCacheKey = "graffiti:search:bootstrap";

  useEffect(() => {
    console.log("SEARCH_TRENDING_TAB_REMOVED", true);
    console.log("SEARCH_TABS_MOVED_UP", true);
  }, []);

  useEffect(() => {
    const pendingReturnState = consumePendingArticleReturnState();

    if (!pendingReturnState || pendingReturnState.path !== "/search/") {
      return;
    }

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (pendingReturnState.searchQuery) {
        setQuery(pendingReturnState.searchQuery);
      }

      window.scrollTo({
        top: pendingReturnState.scrollY ?? 0,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrameId);
    };
  }, []);

  useEffect(() => {
    async function loadSearchData() {
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(searchBootstrapCacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as {
              articles?: NewsArticle[];
              trendingTerms?: string[];
            };
            if (Array.isArray(cached.articles) && cached.articles.length > 0) {
              setArticles(cached.articles);
            }
            if (Array.isArray(cached.trendingTerms) && cached.trendingTerms.length > 0) {
              setTrendingTerms(cached.trendingTerms);
            }
            setIsLoading(false);
          }
        } catch (error) {
          console.error("SEARCH CACHE READ FAILED", error);
        }
      }

      setIsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const response = await Promise.race([
          apiFetch(`/api/news?mode=trending&page=1&pageSize=${SEARCH_PAGE_SIZE}`),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Search bootstrap request timed out")), 6000);
          }),
        ]);
        const payload = normalizeSearchPayload(
          (await response.json()) as NewsArticle[] | SearchNewsResponse
        );
        const news = payload.articles;
        setArticles(news);

        const derivedTerms = buildTrendingTerms(news);

        if (derivedTerms.length > 0) {
          setTrendingTerms(derivedTerms);
        }

        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            searchBootstrapCacheKey,
            JSON.stringify({
              articles: news,
              trendingTerms: derivedTerms.length > 0 ? derivedTerms : fallbackTrendingTerms,
            })
          );
        }

        setCurrentUserId(user?.id ?? null);
        setCurrentUserEmail(user?.email ?? null);

        if (user?.id) {
          const ensuredProfile = await ensureProfileRow({
            id: user.id,
            email: user.email ?? null,
          });
          const { data: ratingsData, error: ratingsError } = await supabase
            .from("source_ratings")
            .select("id, user_id, source_name, rating");

          if (ratingsError) {
            console.error("Error loading source hearts:", ratingsError);
            setSourceRatings([]);
          } else {
            setSourceRatings((ratingsData ?? []) as SourceRatingRow[]);
          }
          setPreferredSources(ensuredProfile.data?.preferred_sources ?? []);
          setShowLessSources(ensuredProfile.data?.show_less_sources ?? []);
        } else {
          setSourceRatings([]);
          setPreferredSources([]);
          setShowLessSources([]);
        }
      } catch (error) {
        console.error("Error loading search data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSearchData();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!normalizedQuery || activeTab !== "articles") {
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchLoading(true);

      try {
        const response = await apiFetch(
          `/api/news?mode=search&query=${encodeURIComponent(
            query.trim()
          )}&page=1&pageSize=${SEARCH_PAGE_SIZE}`
        );

        if (!response.ok) {
          throw new Error(`Search request failed with status ${response.status}`);
        }

        const payload = normalizeSearchPayload(
          (await response.json()) as NewsArticle[] | SearchNewsResponse
        );

        if (!isCancelled) {
          setSearchArticles(dedupeSearchArticles(payload.articles));
          setSearchPage(payload.page);
          setHasMoreSearchResults(payload.hasMore);
        }
      } catch (error) {
        console.error("Error loading search articles:", error);
        if (!isCancelled) {
          setSearchArticles([]);
          setSearchPage(1);
          setHasMoreSearchResults(false);
        }
      } finally {
        if (!isCancelled) {
          setIsSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery || activeTab !== "articles") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSearchArticles([]);
      setSearchPage(1);
      setHasMoreSearchResults(false);
      setIsSearchLoading(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, normalizedQuery, query]);

  useEffect(() => {
    console.log("SEARCH_ACTIVE_TAB", activeTab);
    console.log("SEARCH_QUERY", normalizedQuery);
  }, [activeTab, normalizedQuery, query]);

  useEffect(() => {
    if (!normalizedQuery) {
      return;
    }

    console.log("SEARCH QUERY_STARTED", {
      query: normalizedQuery,
      tab: activeTab,
    });
    console.log("SEARCH_ACTIVE_TAB", activeTab);
    console.log("SEARCH_QUERY", normalizedQuery);

    if (resultsAreaRef.current && typeof window !== "undefined") {
      const top = resultsAreaRef.current.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({
        top: Math.max(top, 0),
        behavior: "auto",
      });
      console.log("SEARCH RESULTS_RENDERED_TOP", {
        query: normalizedQuery,
      });
    }
  }, [activeTab, normalizedQuery]);

  useEffect(() => {
    const sentinel = loadMoreSearchSentinelRef.current;

    if (
      !sentinel ||
      !normalizedQuery ||
      activeTab !== "articles" ||
      isSearchLoading ||
      isLoadingMoreSearchResults ||
      !hasMoreSearchResults
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (
          !entry?.isIntersecting ||
          activeTab !== "articles" ||
          isSearchLoading ||
          isLoadingMoreSearchResults ||
          !hasMoreSearchResults ||
          isFetchingNextSearchPageRef.current
        ) {
          return;
        }

        void (async () => {
          isFetchingNextSearchPageRef.current = true;
          setIsLoadingMoreSearchResults(true);

          try {
            const response = await apiFetch(
              `/api/news?mode=search&query=${encodeURIComponent(
                query.trim()
              )}&page=${searchPage + 1}&pageSize=${SEARCH_PAGE_SIZE}`
            );

            if (!response.ok) {
              throw new Error(`Search request failed with status ${response.status}`);
            }

            const payload = normalizeSearchPayload(
              (await response.json()) as NewsArticle[] | SearchNewsResponse
            );

            setSearchArticles((prev) =>
              dedupeSearchArticles([...prev, ...payload.articles])
            );
            setSearchPage(payload.page);
            setHasMoreSearchResults(payload.hasMore);
          } catch (error) {
            console.error("Error loading more search articles:", error);
            setHasMoreSearchResults(false);
          } finally {
            isFetchingNextSearchPageRef.current = false;
            setIsLoadingMoreSearchResults(false);
          }
        })();
      },
      {
        rootMargin: "260px 0px",
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    hasMoreSearchResults,
    activeTab,
    isLoadingMoreSearchResults,
    isSearchLoading,
    normalizedQuery,
    query,
    searchPage,
  ]);

  useEffect(() => {
    async function loadUserResults() {
      if (!normalizedQuery) {
        setUserResults([]);
        return;
      }

      if (activeTab !== "users") {
        return;
      }

      console.log("USER_SEARCH_STARTED", normalizedQuery);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${query.trim()}%`)
        .limit(20);

      if (error) {
        console.warn("USER_SEARCH_WARNING", {
          message: error.message ?? null,
          code: error.code ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        });
        setUserResults([]);
        console.log("USER_SEARCH_RESULTS_COUNT", 0);
        return;
      }

      const users = ((data ?? []) as UserProfileSearchResult[]).filter(
        (profile) => profile.username && profile.id
      );

      console.log("USER SEARCH RAW RESULTS", users);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      let filteredUsers = users;

      if (currentUser?.id) {
        console.log("currentUser.id", currentUser.id);

        const { data: blockedRowsData, error: blockedFilterError } = await supabase
          .from("blocked_users")
          .select("blocker_id, blocked_id")
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

        if (blockedFilterError) {
          console.log("BLOCKED FILTER ERROR", blockedFilterError);
        } else {
          const blockedRows = ((blockedRowsData ?? []) as BlockedUserRow[]) ?? [];
          console.log("BLOCKED ROWS", blockedRows);

          const hiddenUserIds = new Set<string>();

          blockedRows.forEach((row) => {
            if (row.blocker_id === currentUser.id && row.blocked_id) {
              hiddenUserIds.add(row.blocked_id);
            }

            if (row.blocked_id === currentUser.id && row.blocker_id) {
              hiddenUserIds.add(row.blocker_id);
            }
          });

          console.log("HIDDEN USER IDS", Array.from(hiddenUserIds));

          filteredUsers = users.filter((profile) => {
            const profileIdentity = getProfileIdentity(profile);

            if (!profileIdentity) {
              return true;
            }

            return !hiddenUserIds.has(profileIdentity);
          });
        }
      }

      filteredUsers = filteredUsers.sort((a, b) => {
          const aName = a.username?.toLowerCase() ?? "";
          const bName = b.username?.toLowerCase() ?? "";

          if (aName === normalizedQuery && bName !== normalizedQuery) {
            return -1;
          }

          if (bName === normalizedQuery && aName !== normalizedQuery) {
            return 1;
          }

          if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) {
            return -1;
          }

          if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) {
            return 1;
          }

          return aName.localeCompare(bName);
        });

      console.log("USER SEARCH FILTERED RESULTS", filteredUsers);
      console.log("USER_SEARCH_RESULTS_COUNT", filteredUsers.length);
      setUserResults(filteredUsers);
    }

    void loadUserResults();
  }, [activeTab, normalizedQuery]);

  const matchedSourceName = useMemo(() => {
    if (!normalizedQuery || activeTab !== "articles") {
      return null;
    }

    const exactMappedSource =
      Object.keys(sourceLogoMap).find((sourceName) => {
        const normalizedSource = sourceName.trim().toLowerCase();
        const aliases = SOURCE_ALIASES[sourceName] ?? [];

        return (
          normalizedSource === normalizedQuery ||
          aliases.includes(normalizedQuery) ||
          normalizedQuery === normalizedSource.replace(/\s+news$/, "")
        );
      }
      ) ?? null;

    if (exactMappedSource) {
      return exactMappedSource;
    }

    const searchPool = searchArticles.length > 0 ? searchArticles : articles;
    const uniqueSources = Array.from(
      new Set(searchPool.map((article) => sanitizeSourceName(article.source)).filter(Boolean))
    ).sort();

    const exactMatch =
      uniqueSources.find((source) => source.toLowerCase() === normalizedQuery) ?? null;

    if (exactMatch) {
      return exactMatch;
    }

    return (
      uniqueSources.find(
        (source) =>
          source.toLowerCase().includes(normalizedQuery) ||
          normalizedQuery.includes(source.toLowerCase())
      ) ?? null
    );
  }, [activeTab, articles, normalizedQuery, searchArticles]);

  useEffect(() => {
    if (!matchedSourceName) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const queryTerms = getSourceAliasTerms(matchedSourceName).slice(0, 4);
        const results = await Promise.allSettled(
          queryTerms.map(async (term) => {
            const response = await apiFetch(
              `/api/news?mode=search&query=${encodeURIComponent(term)}&page=1&pageSize=12`
            );

            if (!response.ok) {
              throw new Error(`Source fallback request failed with status ${response.status}`);
            }

            const payload = normalizeSearchPayload(
              (await response.json()) as NewsArticle[] | SearchNewsResponse
            );

            return payload.articles;
          })
        );

        if (isCancelled) {
          return;
        }

        setSourceFallbackArticles(
          dedupeSearchArticles(
            results.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
          )
        );
      } catch (error) {
        console.error("Error loading source fallback articles:", error);
        if (!isCancelled) {
          setSourceFallbackArticles([]);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [matchedSourceName]);

  const matchedSourceHeartCount = useMemo(
    () =>
      matchedSourceName
        ? sourceRatings.filter(
            (rating) =>
              rating.source_name === matchedSourceName && rating.rating === "like"
          ).length
        : 0,
    [matchedSourceName, sourceRatings]
  );

  const matchedSourceHearted = useMemo(
    () =>
      Boolean(
        matchedSourceName &&
          currentUserId &&
          sourceRatings.find(
            (rating) =>
              rating.user_id === currentUserId &&
              rating.source_name === matchedSourceName &&
              rating.rating === "like"
          )
      ),
    [currentUserId, matchedSourceName, sourceRatings]
  );
  const matchedSourceShowLess = useMemo(
    () => Boolean(matchedSourceName && showLessSources.includes(matchedSourceName)),
    [matchedSourceName, showLessSources]
  );

  const handleToggleSourceHeart = async (sourceName: string) => {
    if (!currentUserId) {
      alert("Log in to heart sources.");
      return;
    }

    const existingRating = sourceRatings.find(
      (rating) => rating.user_id === currentUserId && rating.source_name === sourceName
    );

    if (existingRating?.rating === "like") {
      const { error } = await supabase
        .from("source_ratings")
        .delete()
        .eq("id", existingRating.id)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("Error clearing source heart:", error);
        return;
      }

      setSourceRatings((prev) => prev.filter((rating) => rating.id !== existingRating.id));
      return;
    }

    const { data, error } = await supabase
      .from("source_ratings")
      .upsert(
        {
          user_id: currentUserId,
          source_name: sourceName,
          rating: "like",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,source_name",
        }
      )
      .select("id, user_id, source_name, rating")
      .single();

    if (error) {
      console.error("Error saving source heart:", error);
      return;
    }

    setSourceRatings((prev) => {
      const next = prev.filter(
        (rating) => !(rating.user_id === currentUserId && rating.source_name === sourceName)
      );
      return [...next, data as SourceRatingRow];
    });
  };

  const handleToggleShowLess = async (sourceName: string) => {
    if (!currentUserId) {
      alert("Log in to customize sources.");
      return;
    }

    const nextShowLessSources = showLessSources.includes(sourceName)
      ? showLessSources.filter((current) => current !== sourceName)
      : [...showLessSources, sourceName];
    const nextPreferredSources = preferredSources.filter((current) => current !== sourceName);

    const { error } = await saveProfilePatch(
      {
        id: currentUserId,
        email: currentUserEmail,
      },
      {
        id: currentUserId,
        email: currentUserEmail,
        preferred_sources: nextPreferredSources,
        show_less_sources: nextShowLessSources,
      }
    );

    if (error) {
      console.error("Error saving show less source preference:", error);
      return;
    }

    setPreferredSources(nextPreferredSources);
    setShowLessSources(nextShowLessSources);
  };

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const normalizedMatchedSource = matchedSourceName?.trim().toLowerCase() ?? null;
    const isExactSourceQuery = normalizedMatchedSource === normalizedQuery;
    const sourceAliasTerms = matchedSourceName ? getSourceAliasTerms(matchedSourceName) : [];
    const candidateArticles = dedupeSearchArticles([
      ...searchArticles,
      ...sourceFallbackArticles,
      ...articles,
    ]);
    const rankedArticles = [...candidateArticles]
      .map((article) => ({
        article,
        score: (() => {
          const sourceName = sanitizeSourceName(article.source);
          const baseScore = getMatchScore(
            {
              ...article,
              source: sourceName,
            },
            normalizedQuery
          );

          if (!isExactSourceQuery || !matchedSourceName) {
            return baseScore;
          }

          const articleText = `${article.title} ${article.description ?? ""} ${
            article.content ?? ""
          }`.toLowerCase();
          const exactSourceMatch = sourceName.toLowerCase() === normalizedMatchedSource;
          const aliasSourceMatch = sourceAliasTerms.some((term) =>
            sourceName.toLowerCase().includes(term)
          );
          const directlyAboutSource = articleText.includes(normalizedQuery);

          if (exactSourceMatch) {
            return baseScore + 25;
          }

          if (aliasSourceMatch) {
            return baseScore + 18;
          }

          if (directlyAboutSource) {
            return baseScore + 4;
          }

          return baseScore - 18;
        })(),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        const timeA = a.article.publishedAt
          ? new Date(a.article.publishedAt).getTime()
          : 0;
        const timeB = b.article.publishedAt
          ? new Date(b.article.publishedAt).getTime()
          : 0;

        return timeB - timeA;
      })
      .map(({ article, score }) => ({
        article,
        score,
      }));

    const recentArticles = rankedArticles.filter(({ article }) => isArticleWithinDays(article, 30));
    const olderArticles = rankedArticles.filter(({ article }) => !isArticleWithinDays(article, 30));

    return (recentArticles.length >= 5 ? recentArticles : [...recentArticles, ...olderArticles])
      .map(({ article }) => article)
      .filter((article) => isTrustedSearchSource(article.source));
  }, [articles, matchedSourceName, normalizedQuery, searchArticles, sourceFallbackArticles]);

  const displayableSearchResultCount = useMemo(
    () => filteredResults.filter((article) => Boolean(getArticleDisplayImage(article).src)).length,
    [filteredResults]
  );

  useEffect(() => {
    console.log("ARTICLE DISPLAY_IMAGE FINAL_COUNT", displayableSearchResultCount);
  }, [displayableSearchResultCount]);

  useEffect(() => {
    console.log("SECTION IMAGE_ONLY_FINAL_COUNT", {
      section: "Search",
      count: displayableSearchResultCount,
    });
  }, [displayableSearchResultCount]);

  useEffect(() => {
    console.log("SEARCH RESULT_COUNT", {
      articles: displayableSearchResultCount,
      users: userResults.length,
      tab: activeTab,
      query: normalizedQuery,
    });
  }, [activeTab, displayableSearchResultCount, normalizedQuery, userResults.length]);

  const handleBlockUser = async (user: UserProfileSearchResult) => {
    const targetUserId = getProfileIdentity(user);

    if (!currentUserId) {
      alert("Log in to block users.");
      return;
    }

    if (!targetUserId) {
      alert("Could not block this user.");
      return;
    }

    if (targetUserId === currentUserId) {
      alert("You cannot block yourself.");
      return;
    }

    setBlockingUserId(targetUserId);

    const result = await createBlockedUser(
      supabase,
      currentUserId,
      targetUserId,
      user.username ?? null
    );

    if (result.error) {
      console.error("Error blocking user from search:", result.error);
      alert(result.error.message ?? "Could not block this user.");
      setBlockingUserId(null);
      return;
    }

    setUserResults((prev) =>
      prev.filter((profile) => getProfileIdentity(profile) !== targetUserId)
    );
    setBlockingUserId(null);
  };

  return (
    <section className="page-shell search-shell">
      <div className="muted" style={{ padding: "8px 16px", textAlign: "center" }}>
        Search page loaded
      </div>
      <section className="search-bar-shell">
        <label className="search-input-shell" htmlFor="search-input">
          <input
            id="search-input"
            className="search-input"
            type="text"
            placeholder="Search news, sources, or topics"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
      </section>

      <div className="trending-tabs-wrap search-tabs-wrap" role="tablist" aria-label="Search tabs">
        <div className="toolbar toolbar-centered">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "articles"}
            className={`toolbar-pill ${activeTab === "articles" ? "toolbar-pill-active" : ""}`}
            onClick={() => setActiveTab("articles")}
          >
            Articles
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "users"}
            className={`toolbar-pill ${activeTab === "users" ? "toolbar-pill-active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
        </div>
      </div>

      {!query.trim() ? (
        <section className="section-card stack">
          <div className="search-section-header">
            <strong className="search-section-title">Trending Now</strong>
          </div>

          {isLoading ? (
            <div className="search-inline-loading" role="status" aria-live="polite">
              Loading search trends...
            </div>
          ) : (
            <div className="search-trending-list">
              {trendingTerms.map((item) => (
                <button
                  key={item}
                  className="search-trending-row"
                  onClick={() => setQuery(item)}
                >
                  <span className="search-trending-label">{item}</span>
                  <span className="search-trending-icon" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 17 17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section ref={resultsAreaRef} className="stack search-results-shell">
          {activeTab === "articles" && matchedSourceName ? (
            <div className="search-results-section search-results-section-sources">
              <p className="search-results-section-heading">Sources</p>
              <Link
                href={`/source/${slugifySourceName(matchedSourceName)}/`}
                className="section-card search-source-card"
              >
                <div className="source-page-header search-source-card-row">
                  <div className="source-page-brand search-source-brand">
                    <SourceBadge sourceName={matchedSourceName} />
                    <div className="source-page-brand-copy">
                      <strong className="search-source-name">{matchedSourceName}</strong>
                      <span className="search-source-kind">News source</span>
                    </div>
                  </div>
                  <div className="source-page-controls">
                    <button
                      type="button"
                      className={`icon-action-pill ${matchedSourceHearted ? "icon-action-pill-active" : ""}`}
                      aria-label={matchedSourceHearted ? "Unheart source" : "Heart source"}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleToggleSourceHeart(matchedSourceName);
                      }}
                    >
                      <span className="icon-action-glyph" aria-hidden="true">
                        <HeartIcon size={18} strokeWidth={1.9} filled={matchedSourceHearted} />
                      </span>
                      <span>{matchedSourceHeartCount}</span>
                    </button>
                    <button
                      type="button"
                      className={`icon-action-pill search-source-show-less ${
                        matchedSourceShowLess ? "icon-action-pill-active" : ""
                      }`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleToggleShowLess(matchedSourceName);
                      }}
                    >
                      <span>{matchedSourceShowLess ? "Showing less" : "Show Less"}</span>
                    </button>
                  </div>
                </div>
              </Link>
              {!isSearchLoading && filteredResults.length === 0 ? (
                <div className="empty-state compact-empty-state search-source-empty-state">
                  <strong>No recent articles found for this source yet.</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "users" && userResults.length > 0 ? (
            <div className="search-results-section search-results-section-users">
              <p className="search-results-section-heading">Users</p>
              <div className="search-results-list">
                {userResults.map((user) => (
                  <div
                    key={user.id}
                    className="section-card search-user-card"
                  >
                    <div className="search-user-card-row">
                      <div className="search-user-brand">
                        <span className="avatar-shell search-user-avatar">
                          {user.avatar_url ? (
                            <Image
                              src={user.avatar_url}
                              alt={user.username ?? "User avatar"}
                              width={48}
                              height={48}
                              unoptimized
                              className="source-avatar-image"
                            />
                          ) : (
                            <span className="avatar-fallback">
                              {(user.username ?? "G").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <div className="stack" style={{ gap: "4px" }}>
                          <strong className="search-source-name">@{user.username}</strong>
                          {user.display_name ? (
                            <span className="search-user-display-name">{user.display_name}</span>
                          ) : null}
                          {user.bio ? (
                            <span className="search-user-bio">{user.bio}</span>
                          ) : (
                            <span className="search-source-kind">Graffiti user</span>
                          )}
                        </div>
                      </div>
                      <div className="search-user-actions">
                        <Link
                          href={`/user/${encodeURIComponent(user.username ?? user.id)}/`}
                          className="comment-action"
                        >
                          View Profile
                        </Link>
                        <button
                          type="button"
                          className="comment-action"
                          disabled={
                            !currentUserId ||
                            getProfileIdentity(user) === currentUserId ||
                            blockingUserId === getProfileIdentity(user)
                          }
                          onClick={() => {
                            void handleBlockUser(user);
                          }}
                        >
                          {blockingUserId === getProfileIdentity(user) ? "Blocking..." : "Block"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "users" ? (
            normalizedQuery && userResults.length === 0 ? (
              <div className="empty-state">
                <strong>No users found</strong>
                <span>Try another username search.</span>
              </div>
            ) : null
          ) : isSearchLoading ? (
            <section className="search-results-loading-shell" role="status" aria-live="polite">
              <div className="search-inline-loading">Searching recent articles...</div>
            </section>
          ) : activeTab === "articles" && filteredResults.length === 0 ? (
            <div className="empty-state">
              <strong>No results found</strong>
              <span>
                Try a news source, person, or topic. Graffiti will search current
                articles across title, source, category, and story text.
              </span>
            </div>
          ) : activeTab === "articles" ? (
            <div className="search-results-section">
              <p className="search-results-section-heading">Articles</p>
              <div className="search-results-list">
                {filteredResults.map((article, index) => (
                  (() => {
                    const displayImage = getArticleDisplayImage(article);
                    const imageSrc = displayImage.src;
                    const imageFailureKey = displayImage.failureKey ?? `${article.id}:none`;
                    const articleKey = getSearchArticleRenderKey(article, index);

                    if (!imageSrc || failedSearchImages[imageFailureKey]) {
                      console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
                        section: "Search",
                        title: article.title,
                        source: article.source,
                      });
                      return null;
                    }
                    const safeSourceName = sanitizeSourceName(article.source);
                    const safeCategoryName = getDisplayCategory(article.category, {
                      source: article.source,
                      title: article.title,
                    });

                    return (
                      <Link
                        key={articleKey}
                        href={`/article/${article.id}/`}
                        className="section-card search-result-card"
                        onClick={(event) => {
                          void handleArticleCardActivation(
                            event,
                            {
                              id: article.id,
                              url: article.url,
                              title: article.title,
                              source: article.source,
                              description: article.description ?? null,
                              imageSrc: imageSrc,
                              publishedLabel: formatSearchDate(article.publishedAt, article.time),
                              category: getCategoryLabel(safeCategoryName),
                            },
                            () => {
                            persistSearchArticleMetadata(article);
                            saveArticleReturnState({
                              path: "/search/",
                              scrollY: window.scrollY,
                              source: "search",
                              searchQuery: query,
                            });
                            }
                          );
                        }}
                      >
                        <div className="search-result-layout">
                          <div className="search-result-copy">
                            <div className="search-result-source-row">
                              <button
                                type="button"
                                className="source-trigger source-trigger-tight trending-source-button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  router.push(`/source/${slugifySourceName(safeSourceName)}/`);
                                }}
                              >
                                <div className="trending-source-brand">
                                  <SourceBadge sourceName={safeSourceName} />
                                  <span className="trending-source-name">{safeSourceName}</span>
                                </div>
                              </button>
                              <span className="chip chip-accent">
                                {getSearchProviderLabel(article.provider)}
                              </span>
                              <span className="chip chip-accent">
                                {getCategoryLabel(safeCategoryName)}
                              </span>
                            </div>

                            <h3 className="search-result-title">
                              {cleanDisplayText(article.title)}
                            </h3>

                            <div className="search-result-meta">
                              <span className="trending-published-date">
                                {formatSearchDate(article.publishedAt, article.time)}
                              </span>
                              {!isArticleWithinDays(article, 30) ? (
                                <span className="chip search-result-age-chip">Older</span>
                              ) : null}
                            </div>

                            {article.description ? (
                              <p className="search-result-description">
                                {cleanDisplayText(article.description)}
                              </p>
                            ) : null}
                          </div>
                          <div className="search-result-image-shell">
                            <img
                              src={imageSrc}
                              alt={cleanDisplayText(article.title)}
                              className="search-result-image"
                              loading="lazy"
                              decoding="async"
                              onError={() => {
                                setFailedSearchImages((prev) => {
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
                      </Link>
                    );
                  })()
                ))}
                {isLoadingMoreSearchResults ? (
                  <div className="search-inline-loading" role="status" aria-live="polite">
                    Loading more articles...
                  </div>
                ) : null}
                {!isSearchLoading && hasMoreSearchResults ? (
                  <div
                    ref={loadMoreSearchSentinelRef}
                    className="feed-load-sentinel"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </section>
  );
}
