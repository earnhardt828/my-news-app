"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import SourceBadge from "../../components/source-badge";
import { apiFetch } from "../../../lib/api-base";
import { getCategoryLabel } from "../../../lib/categories";
import { cleanDisplayText } from "../../../lib/display-text";
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

function normalizeSourceNewsPayload(payload: SourceArticle[] | SourceNewsResponse) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.articles ?? [];
}

function formatSourceDate(publishedAt?: string | null, fallback?: string) {
  if (!publishedAt) {
    return fallback ?? "Recent";
  }

  const timestamp = new Date(publishedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return fallback ?? "Recent";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function SourcePage({
  params,
}: {
  params: Promise<{ sourceSlug: string }>;
}) {
  const [articles, setArticles] = useState<SourceArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceSlug, setSourceSlug] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<SourceRatingRow[]>([]);
  const [isSavingRating, setIsSavingRating] = useState(false);

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
        const [trendingResponse, searchResponse] = await Promise.all([
          apiFetch("/api/news?mode=trending&page=1&pageSize=75"),
          apiFetch(
            `/api/news?mode=search&query=${encodeURIComponent(
              sourceName
            )}&page=1&pageSize=60`
          ),
        ]);
        const trendingNews = normalizeSourceNewsPayload(
          (await trendingResponse.json()) as SourceArticle[] | SourceNewsResponse
        );
        const searchNews = normalizeSourceNewsPayload(
          (await searchResponse.json()) as SourceArticle[] | SourceNewsResponse
        );
        const { data: ratingsData, error: ratingsError } = await supabase
          .from("source_ratings")
          .select("id, user_id, source_name, rating")
          .eq("source_name", sourceName);

        if (ratingsError) {
          console.error("Error loading source ratings:", ratingsError);
        }

        const mergedNews = [...trendingNews];

        searchNews.forEach((article) => {
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

        const filtered = mergedNews
          .filter(
            (article) =>
              slugifySourceName(article.source) === resolvedParams.sourceSlug ||
              article.source.toLowerCase() === sourceName.toLowerCase()
          )
          .sort((a, b) => {
            const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return timeB - timeA;
          });

        if (!isMounted) {
          return;
        }

        setUserId(user?.id ?? null);
        setArticles(filtered);
        setRatings((ratingsData ?? []) as SourceRatingRow[]);
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
  const dislikeCount = useMemo(
    () => ratings.filter((rating) => rating.rating === "dislike").length,
    [ratings]
  );
  const netScore = likeCount - dislikeCount;

  const handleRateSource = async (rating: "like" | "dislike") => {
    if (!userId) {
      alert("Log in to rate sources.");
      return;
    }

    setIsSavingRating(true);

    const existingRating = ratings.find(
      (currentRating) =>
        currentRating.user_id === userId && currentRating.source_name === sourceName
    );

    if (existingRating?.rating === rating) {
      const { error } = await supabase
        .from("source_ratings")
        .delete()
        .eq("id", existingRating.id)
        .eq("user_id", userId);

      setIsSavingRating(false);

      if (error) {
        console.error("Error clearing source rating:", error);
        return;
      }

      setRatings((prev) => prev.filter((currentRating) => currentRating.id !== existingRating.id));
      return;
    }

    const { data, error } = await supabase
      .from("source_ratings")
      .upsert(
        {
          user_id: userId,
          source_name: sourceName,
          rating,
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

    setRatings((prev) => {
      const next = prev.filter(
        (currentRating) =>
          !(currentRating.user_id === userId && currentRating.source_name === sourceName)
      );
      return [...next, data as SourceRatingRow];
    });
  };

  return (
    <section className="page-shell source-page-shell">
      <section className="section-card source-page-card">
        <div className="source-page-header">
          <div className="source-page-brand">
            <SourceBadge sourceName={sourceName} />
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="search-source-name">{sourceName}</strong>
              <span className="search-source-kind">Recent coverage</span>
            </div>
          </div>
          <div className="source-rating-summary">
            <span>👍 {likeCount}</span>
            <span>👎 {dislikeCount}</span>
            <strong>{netScore >= 0 ? `+${netScore}` : netScore}</strong>
          </div>
        </div>

        <div className="source-rating-actions">
          <button
            type="button"
            className={`icon-action-pill ${
              userRating === "like" ? "icon-action-pill-active" : ""
            }`}
            onClick={() => void handleRateSource("like")}
            disabled={isSavingRating}
          >
            <span>👍</span>
            <span>Like</span>
          </button>
          <button
            type="button"
            className={`icon-action-pill ${
              userRating === "dislike" ? "icon-action-pill-active" : ""
            }`}
            onClick={() => void handleRateSource("dislike")}
            disabled={isSavingRating}
          >
            <span>👎</span>
            <span>Dislike</span>
          </button>
        </div>
      </section>

      {isLoading ? (
        <LoadingScreen label={`Loading ${sourceName}`} />
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <strong>No recent articles from this source yet.</strong>
          <span>Check back soon or explore another source from Search.</span>
        </div>
      ) : (
        <div className="search-results-list">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/article/${article.id}`}
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
      )}
    </section>
  );
}
