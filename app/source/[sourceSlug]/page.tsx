"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import SourceBadge from "../../components/source-badge";
import { getCategoryLabel } from "../../../lib/categories";
import {
  getSourceNameFromSlug,
  slugifySourceName,
} from "../../../lib/source-logos";

type SourceArticle = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  description?: string | null;
  publishedAt?: string | null;
};

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

  useEffect(() => {
    let isMounted = true;

    async function loadSourceArticles() {
      const resolvedParams = await params;

      if (!isMounted) {
        return;
      }

      setSourceSlug(resolvedParams.sourceSlug);
      setIsLoading(true);

      try {
        const response = await fetch("/api/news");
        const news = (await response.json()) as SourceArticle[];
        const sourceName = getSourceNameFromSlug(resolvedParams.sourceSlug);
        const filtered = news
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

        setArticles(filtered);
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

  return (
    <section className="page-shell source-page-shell">
      <section className="section-card source-page-card">
        <div className="source-page-brand">
          <SourceBadge sourceName={sourceName} />
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="search-source-name">{sourceName}</strong>
            <span className="search-source-kind">Recent coverage</span>
          </div>
        </div>
      </section>

      {isLoading ? (
        <LoadingScreen label={`Loading ${sourceName}`} />
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <strong>No recent articles found</strong>
          <span>Try another news source or head back to Search.</span>
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

              <h3 className="search-result-title">{article.title}</h3>

              <div className="search-result-meta">
                <span className="trending-published-date">
                  {formatSourceDate(article.publishedAt, article.time)}
                </span>
              </div>

              {article.description ? (
                <p className="search-result-description">{article.description}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
