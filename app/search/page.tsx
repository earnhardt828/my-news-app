"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-base";
import { getBestArticleImage } from "../../lib/article-images";
import SourceBadge from "../components/source-badge";
import { getCategoryLabel } from "../../lib/categories";
import { cleanDisplayText } from "../../lib/display-text";
import { slugifySourceName, sourceLogoMap } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";

const SEARCH_PAGE_SIZE = 25;

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
};

type UserProfileSearchResult = {
  id: string;
  user_id?: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type BlockedUserRow = {
  blocker_id: string | null;
  blocked_id: string | null;
};

type SearchDateFilter = "recent" | "week" | "month" | "all";

type SearchNewsResponse = {
  articles: NewsArticle[];
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
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

function formatSearchDate(publishedAt?: string | null, fallback?: string) {
  if (!publishedAt) {
    return fallback ?? "Recent";
  }

  const timestamp = new Date(publishedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return fallback ?? "Recent";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

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

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
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

function getSearchResultImage(article: NewsArticle) {
  return getBestArticleImage(article).src;
}

function sanitizeSourceName(value: string | null | undefined) {
  return cleanDisplayText(value ?? "").replace(/\s+\d+(?:\.\d+)?$/, "").trim();
}

function dedupeSearchArticles(articles: NewsArticle[]) {
  const seen = new Set<string>();

  return articles.filter((article) => {
    const key = article.url?.trim()
      ? `url:${article.url.trim().toLowerCase()}`
      : `id:${article.id}:${article.title.trim().toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [searchArticles, setSearchArticles] = useState<NewsArticle[]>([]);
  const [userResults, setUserResults] = useState<UserProfileSearchResult[]>([]);
  const [trendingTerms, setTrendingTerms] = useState<string[]>(fallbackTrendingTerms);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingMoreSearchResults, setIsLoadingMoreSearchResults] = useState(false);
  const [searchDateFilter, setSearchDateFilter] = useState<SearchDateFilter>("recent");
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [failedSearchImages, setFailedSearchImages] = useState<Record<string, boolean>>({});
  const loadMoreSearchSentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextSearchPageRef = useRef(false);

  useEffect(() => {
    async function loadSearchData() {
      setIsLoading(true);

      try {
        const response = await apiFetch(
          `/api/news?mode=trending&page=1&pageSize=${SEARCH_PAGE_SIZE}`
        );
        const payload = normalizeSearchPayload(
          (await response.json()) as NewsArticle[] | SearchNewsResponse
        );
        const news = payload.articles;
        setArticles(news);

        const derivedTerms = buildTrendingTerms(news);

        if (derivedTerms.length > 0) {
          setTrendingTerms(derivedTerms);
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
    if (!normalizedQuery) {
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
  }, [normalizedQuery, query]);

  useEffect(() => {
    if (normalizedQuery) {
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
  }, [normalizedQuery]);

  useEffect(() => {
    const sentinel = loadMoreSearchSentinelRef.current;

    if (
      !sentinel ||
      !normalizedQuery ||
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

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .ilike("username", `%${normalizedQuery}%`)
        .not("username", "is", null)
        .limit(8);

      if (error) {
        console.error("Error loading user search results:", error);
        setUserResults([]);
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
            if (!profile.id) {
              return true;
            }

            return !hiddenUserIds.has(profile.id);
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
      setUserResults(filteredUsers);
    }

    void loadUserResults();
  }, [normalizedQuery]);

  const matchedSourceName = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    const exactMappedSource =
      Object.keys(sourceLogoMap).find(
        (sourceName) => sourceName.trim().toLowerCase() === normalizedQuery
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
  }, [articles, normalizedQuery, searchArticles]);

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const normalizedMatchedSource = matchedSourceName?.trim().toLowerCase() ?? null;
    const isExactSourceQuery = normalizedMatchedSource === normalizedQuery;
    const candidateArticles = searchArticles.length > 0 ? searchArticles : articles;
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
          const directlyAboutSource = articleText.includes(normalizedQuery);

          if (exactSourceMatch) {
            return baseScore + 25;
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

    if (searchDateFilter === "week") {
      return rankedArticles
        .filter(({ article }) => isArticleWithinDays(article, 7))
        .map(({ article }) => article);
    }

    if (searchDateFilter === "month") {
      return rankedArticles
        .filter(({ article }) => isArticleWithinDays(article, 30))
        .map(({ article }) => article);
    }

    if (searchDateFilter === "all") {
      return rankedArticles.map(({ article }) => article);
    }

    const recentArticles = rankedArticles.filter(({ article }) => isArticleWithinDays(article, 30));
    const olderArticles = rankedArticles.filter(({ article }) => !isArticleWithinDays(article, 30));

    return (recentArticles.length >= 5 ? recentArticles : [...recentArticles, ...olderArticles]).map(
      ({ article }) => article
    );
  }, [articles, matchedSourceName, normalizedQuery, searchArticles, searchDateFilter]);

  return (
    <section className="page-shell search-shell">
      <section className="search-bar-shell">
        <label className="search-input-shell" htmlFor="search-input">
          <input
            id="search-input"
            className="search-input"
            type="text"
            placeholder="Search news, sources, or topics"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

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
        <section className="stack search-results-shell">
          {userResults.length > 0 ? (
            <div className="search-results-section">
              <p className="search-results-section-heading">Users</p>
              <div className="search-results-list">
                {userResults.map((user) => (
                  <Link
                    key={user.id}
                    href={`/user/${encodeURIComponent(user.username ?? user.id)}`}
                    className="section-card search-user-card"
                    onClick={() => {
                      console.log("CLICKED USER", user);
                      console.log("NAVIGATING TO USERNAME", user.username);
                    }}
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
                          {user.bio ? (
                            <span className="search-user-bio">{user.bio}</span>
                          ) : (
                            <span className="search-source-kind">Graffiti user</span>
                          )}
                        </div>
                      </div>
                      <span className="search-trending-icon" aria-hidden="true">
                        ↗
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {matchedSourceName ? (
            <div className="search-results-section">
              <p className="search-results-section-heading">Sources</p>
              <Link
                href={`/source/${slugifySourceName(matchedSourceName)}`}
                className="section-card search-source-card"
              >
                <div className="search-source-card-row">
                  <div className="search-source-brand">
                    <SourceBadge sourceName={matchedSourceName} />
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="search-source-name">{matchedSourceName}</strong>
                      <span className="search-source-kind">News source</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ) : null}

          <div className="search-results-section">
            <p className="search-results-section-heading">Date filters</p>
            <div className="search-results-filter-row" role="tablist" aria-label="Search date filter">
              {[
                { value: "recent", label: "Recent" },
                { value: "week", label: "Past Week" },
                { value: "month", label: "Past Month" },
                { value: "all", label: "All Time" },
              ].map((filterOption) => (
                <button
                  key={filterOption.value}
                  type="button"
                  className={`chip search-filter-chip ${
                    searchDateFilter === filterOption.value ? "search-filter-chip-active" : ""
                  }`}
                  onClick={() => setSearchDateFilter(filterOption.value as SearchDateFilter)}
                >
                  {filterOption.label}
                </button>
              ))}
            </div>
          </div>

          {isSearchLoading ? (
            <div className="search-inline-loading" role="status" aria-live="polite">
              Searching recent articles...
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="empty-state">
              <strong>No results found</strong>
              <span>
                Try a news source, person, or topic. Graffiti will search current
                articles across title, source, category, and story text.
              </span>
            </div>
          ) : (
            <div className="search-results-section">
              <p className="search-results-section-heading">Articles</p>
              <div className="search-results-list">
                {filteredResults.map((article) => (
                  (() => {
                    const imageSrc = getSearchResultImage(article);
                    const imageFailureKey = imageSrc
                      ? `${article.id}:${imageSrc}`
                      : `${article.id}:none`;
                    const shouldShowImage =
                      Boolean(imageSrc) && !failedSearchImages[imageFailureKey];
                    const safeSourceName = sanitizeSourceName(article.source);

                    return (
                      <Link
                        key={article.id}
                        href={`/article/${article.id}`}
                        className="section-card search-result-card"
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
                                  router.push(`/source/${slugifySourceName(safeSourceName)}`);
                                }}
                              >
                                <div className="trending-source-brand">
                                  <SourceBadge sourceName={safeSourceName} />
                                  <span className="trending-source-name">{safeSourceName}</span>
                                </div>
                              </button>
                              <span className="chip chip-accent">
                                {getCategoryLabel(article.category)}
                              </span>
                            </div>

                            <h3 className="search-result-title">
                              {cleanDisplayText(article.title)}
                            </h3>

                            <div className="search-result-meta">
                              <span className="trending-published-date">
                                {formatSearchDate(article.publishedAt, article.time)}
                              </span>
                              {formatSearchDateDetail(article.publishedAt) ? (
                                <span className="search-result-date-detail">
                                  {formatSearchDateDetail(article.publishedAt)}
                                </span>
                              ) : null}
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
                          {shouldShowImage ? (
                            <div className="search-result-image-shell">
                              <img
                                src={imageSrc as string}
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
                          ) : null}
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
          )}
        </section>
      )}
    </section>
  );
}
