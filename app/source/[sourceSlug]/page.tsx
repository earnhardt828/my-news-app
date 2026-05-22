"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import SourceBadge from "../../components/source-badge";
import { apiFetch } from "../../../lib/api-base";
import { getCategoryLabel } from "../../../lib/categories";
import { cleanDisplayText } from "../../../lib/display-text";
import { ensureProfileRow, saveProfilePatch } from "../../../lib/profile-store";
import { formatRelativeTimestamp } from "../../../lib/relative-time";
import {
  getSourceNameFromSlug,
  slugifySourceName,
} from "../../../lib/source-logos";
import { supabase } from "../../../lib/supabase";

type SourceArticle = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  description?: string | null;
  publishedAt?: string | null;
};

type SourceRatingRow = {
  id: string;
  user_id: string;
  source_name: string;
  rating: "like" | "dislike";
};

type SourceNewsResponse = {
  articles: SourceArticle[];
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type UserState = {
  id: string;
  email: string | null;
};

function normalizeSourceNewsPayload(payload: SourceArticle[] | SourceNewsResponse) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.articles ?? [];
}

function formatSourceDate(publishedAt?: string | null, fallback?: string) {
  return formatRelativeTimestamp(publishedAt, fallback);
}

function normalizeSourceLabel(value?: string | null) {
  return cleanDisplayText(value ?? "")
    .replace(/\s+\d+(?:\.\d+)?$/, "")
    .trim()
    .toLowerCase();
}

function normalizeSourceArticleUrl(url?: string | null) {
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
}

function normalizeSourceArticleTitle(title?: string | null) {
  return cleanDisplayText(title ?? "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeSourceArticles(articles: SourceArticle[]) {
  const bestByKey = new Map<string, SourceArticle>();

  const isBetterArticle = (candidate: SourceArticle, current: SourceArticle) => {
    const candidateTime = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0;
    const currentTime = current.publishedAt ? new Date(current.publishedAt).getTime() : 0;

    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }

    return (candidate.description?.length ?? 0) > (current.description?.length ?? 0);
  };

  articles.forEach((article) => {
    const normalizedUrl = normalizeSourceArticleUrl((article as SourceArticle & { url?: string | null }).url);
    const normalizedTitle = normalizeSourceArticleTitle(article.title);
    const sourceKey = normalizeSourceLabel(article.source);
    const keys = [
      normalizedUrl ? `url:${normalizedUrl}` : null,
      normalizedTitle ? `title:${sourceKey}:${normalizedTitle}` : null,
    ].filter(Boolean) as string[];

    if (keys.length === 0) {
      keys.push(`id:${article.id}`);
    }

    const existing = keys
      .map((key) => bestByKey.get(key))
      .find((value): value is SourceArticle => Boolean(value));
    const bestArticle = existing && !isBetterArticle(article, existing) ? existing : article;

    keys.forEach((key) => bestByKey.set(key, bestArticle));
  });

  return Array.from(bestByKey.values());
}

export default function SourcePage({
  params,
}: {
  params: Promise<{ sourceSlug: string }>;
}) {
  const [articles, setArticles] = useState<SourceArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceSlug, setSourceSlug] = useState("");
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<SourceRatingRow[]>([]);
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [isSavingPreference, setIsSavingPreference] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSourceArticles() {
      const resolvedParams = await params;

      if (!isMounted) {
        return;
      }

      setSourceSlug(resolvedParams.sourceSlug);
      const sourceName = getSourceNameFromSlug(resolvedParams.sourceSlug);
      setIsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const [trendingResponse, latestResponse, searchResponse] = await Promise.all([
          apiFetch("/api/news?mode=trending&page=1&pageSize=100"),
          apiFetch("/api/news?mode=latest&page=1&pageSize=100"),
          apiFetch(
            `/api/news?mode=search&query=${encodeURIComponent(
              sourceName
            )}&page=1&pageSize=75`
          ),
        ]);
        const trendingNews = normalizeSourceNewsPayload(
          (await trendingResponse.json()) as SourceArticle[] | SourceNewsResponse
        );
        const latestNews = normalizeSourceNewsPayload(
          (await latestResponse.json()) as SourceArticle[] | SourceNewsResponse
        );
        const searchNews = normalizeSourceNewsPayload(
          (await searchResponse.json()) as SourceArticle[] | SourceNewsResponse
        );
        const { data: ratingsData, error: ratingsError } = await supabase
          .from("source_ratings")
          .select("id, user_id, source_name, rating")
          .eq("source_name", sourceName);
        const ensuredProfile = user?.id
          ? await ensureProfileRow({
              id: user.id,
              email: user.email ?? null,
            })
          : null;

        if (ratingsError) {
          console.error("Error loading source ratings:", ratingsError);
        }

        const mergedNews: SourceArticle[] = [];
        [...searchNews, ...latestNews, ...trendingNews].forEach((article) => {
          if (
            mergedNews.some(
              (existingArticle) =>
                existingArticle.id === article.id ||
                (existingArticle.title === article.title &&
                  existingArticle.source === article.source)
            )
          ) {
            return;
          }

          mergedNews.push(article);
        });

        const sourceLabel = normalizeSourceLabel(sourceName);

        const filtered = dedupeSourceArticles(mergedNews)
          .filter((article) => {
            const articleSourceLabel = normalizeSourceLabel(article.source);
            const articleTitleLabel = normalizeSourceLabel(article.title);
            const articleDescriptionLabel = normalizeSourceLabel(article.description ?? "");
            return (
              slugifySourceName(article.source) === resolvedParams.sourceSlug ||
              articleSourceLabel === sourceLabel ||
              articleSourceLabel.includes(sourceLabel) ||
              sourceLabel.includes(articleSourceLabel) ||
              articleTitleLabel.includes(sourceLabel) ||
              articleDescriptionLabel.includes(sourceLabel)
            );
          })
          .sort((left, right) => {
            const leftSource = normalizeSourceLabel(left.source);
            const rightSource = normalizeSourceLabel(right.source);
            const leftExact = leftSource === sourceLabel ? 1 : 0;
            const rightExact = rightSource === sourceLabel ? 1 : 0;

            if (rightExact !== leftExact) {
              return rightExact - leftExact;
            }

            const leftContains =
              Number(normalizeSourceLabel(left.title).includes(sourceLabel)) +
              Number(normalizeSourceLabel(left.description ?? "").includes(sourceLabel));
            const rightContains =
              Number(normalizeSourceLabel(right.title).includes(sourceLabel)) +
              Number(normalizeSourceLabel(right.description ?? "").includes(sourceLabel));

            if (rightContains !== leftContains) {
              return rightContains - leftContains;
            }

            const timeA = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
            const timeB = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
            return timeB - timeA;
          })
          ;

        if (!isMounted) {
          return;
        }

        setCurrentUser(
          user?.id
            ? {
                id: user.id,
                email: user.email ?? null,
              }
            : null
        );
        setUserId(user?.id ?? null);
        setArticles(filtered);
        setRatings((ratingsData ?? []) as SourceRatingRow[]);
        setPreferredSources(ensuredProfile?.data?.preferred_sources ?? []);
        setShowLessSources(ensuredProfile?.data?.show_less_sources ?? []);
        window.dispatchEvent(
          new CustomEvent("reflekt:source-title", { detail: sourceName })
        );
      } catch (error) {
        console.error("Error loading source page:", error);
        if (isMounted) {
          setArticles([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSourceArticles();

    return () => {
      isMounted = false;
    };
  }, [params]);

  const sourceName = useMemo(
    () => getSourceNameFromSlug(sourceSlug),
    [sourceSlug]
  );
  const userRating = useMemo(
    () =>
      ratings.find(
        (rating) => rating.user_id === userId && rating.source_name === sourceName
      )?.rating ?? null,
    [ratings, sourceName, userId]
  );
  const likeCount = useMemo(
    () => ratings.filter((rating) => rating.rating === "like").length,
    [ratings]
  );
  const isShowLessSource = showLessSources.includes(sourceName);

  const handleToggleHeart = async () => {
    if (!currentUser?.id) {
      alert("Log in to heart sources.");
      return;
    }

    setIsSavingRating(true);

    const existingRating = ratings.find(
      (currentRating) =>
        currentRating.user_id === currentUser.id && currentRating.source_name === sourceName
    );

    if (existingRating?.rating === "like") {
      const { error } = await supabase
        .from("source_ratings")
        .delete()
        .eq("id", existingRating.id)
        .eq("user_id", currentUser.id);

      setIsSavingRating(false);

      if (error) {
        console.error("Error clearing source rating:", error);
        return;
      }

      if (currentUser.id) {
        const nextPreferredSources = preferredSources.filter((current) => current !== sourceName);
        const saveResult = await saveProfilePatch(currentUser, {
          id: currentUser.id,
          email: currentUser.email,
          preferred_sources: nextPreferredSources,
          show_less_sources: showLessSources,
        });

        if (!saveResult.error) {
          setPreferredSources(nextPreferredSources);
        }
      }

      setRatings((prev) => prev.filter((currentRating) => currentRating.id !== existingRating.id));
      return;
    }

    const { data, error } = await supabase
      .from("source_ratings")
      .upsert(
        {
          user_id: currentUser.id,
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

    setIsSavingRating(false);

    if (error) {
      console.error("Error saving source rating:", error);
      return;
    }

    if (currentUser.id) {
      const nextPreferredSources = preferredSources.includes(sourceName)
        ? preferredSources
        : [...preferredSources, sourceName];
      const nextShowLessSources = showLessSources.filter((current) => current !== sourceName);
      const saveResult = await saveProfilePatch(currentUser, {
        id: currentUser.id,
        email: currentUser.email,
        preferred_sources: nextPreferredSources,
        show_less_sources: nextShowLessSources,
      });

      if (!saveResult.error) {
        setPreferredSources(nextPreferredSources);
        setShowLessSources(nextShowLessSources);
      }
    }

    setRatings((prev) => {
      const next = prev.filter(
        (currentRating) => !(currentRating.user_id === currentUser.id && currentRating.source_name === sourceName)
      );
      return [...next, data as SourceRatingRow];
    });
  };

  const handleToggleShowLess = async () => {
    if (!currentUser?.id) {
      alert("Log in to customize My News sources.");
      return;
    }

    setIsSavingPreference(true);

    const nextShowLessSources = isShowLessSource
      ? showLessSources.filter((current) => current !== sourceName)
      : [...showLessSources, sourceName];
    const nextPreferredSources = preferredSources.filter((current) => current !== sourceName);

    const { error } = await saveProfilePatch(currentUser, {
      id: currentUser.id,
      email: currentUser.email,
      preferred_sources: nextPreferredSources,
      show_less_sources: nextShowLessSources,
    });

    setIsSavingPreference(false);

    if (error) {
      console.error("Error saving source preference:", error);
      return;
    }

    setPreferredSources(nextPreferredSources);
    setShowLessSources(nextShowLessSources);
  };

  return (
    <section className="page-shell source-page-shell">
      <section className="section-card source-page-card">
        <div className="source-page-header">
          <div className="source-page-brand">
            <SourceBadge sourceName={sourceName} />
            <div className="source-page-brand-copy">
              <strong className="search-source-name">{sourceName}</strong>
              <span className="search-source-kind">News source</span>
            </div>
          </div>
          <div className="source-page-controls">
            <button
              type="button"
              className={`icon-action-pill ${userRating === "like" ? "icon-action-pill-active" : ""}`}
              onClick={() => void handleToggleHeart()}
              disabled={isSavingRating}
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={userRating === "like" ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m12 20.5-1.3-1.2C5.2 14.3 2 11.4 2 7.8 2 5.1 4.2 3 6.9 3c1.5 0 3 .7 4.1 1.9C12.1 3.7 13.6 3 15.1 3 17.8 3 20 5.1 20 7.8c0 3.6-3.2 6.5-8.7 11.5L12 20.5Z" />
                </svg>
              </span>
              <span>{likeCount}</span>
            </button>
            <button
              type="button"
              className={`icon-action-pill ${isShowLessSource ? "icon-action-pill-active" : ""}`}
              onClick={() => void handleToggleShowLess()}
              disabled={isSavingPreference}
            >
              <span>{isShowLessSource ? "Showing less" : "Show Less"}</span>
            </button>
          </div>
        </div>
        <p className="source-page-subtitle">
          Heart this source to see more of it in Polls and personalized areas, or show less in My News.
        </p>
      </section>

      {isLoading ? (
        <LoadingScreen label={`Loading ${sourceName}`} />
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <strong>No recent {sourceName} articles found yet.</strong>
          <span>Check back soon or explore another source from Search.</span>
        </div>
      ) : (
        <div className="search-results-section">
          <p className="search-results-section-heading">Recent Articles</p>
          <div className="search-results-list">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/article/${article.id}/`}
              className="section-card search-result-card"
            >
              <div className="search-result-source-row">
                <div className="trending-source-brand">
                  <SourceBadge sourceName={article.source} />
                  <span className="trending-source-name">{article.source}</span>
                </div>
                <span className="chip chip-accent">{getCategoryLabel(article.category)}</span>
              </div>

              <h3 className="search-result-title">{cleanDisplayText(article.title)}</h3>

              <div className="search-result-meta">
                <span className="trending-published-date">
                  {formatSourceDate(article.publishedAt, article.time)}
                </span>
              </div>

              {article.description ? (
                <p className="search-result-description">
                  {cleanDisplayText(article.description)}
                </p>
              ) : null}
            </Link>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}
