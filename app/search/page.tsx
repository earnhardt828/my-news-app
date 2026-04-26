"use client";

import { useEffect, useMemo, useState } from "react";

type NewsArticle = {
  title: string;
  source: string;
  category: string;
};

const fallbackTrendingTerms = [
  "CNN",
  "Markets",
  "Tech layoffs",
  "World News",
  "AI",
  "Elections",
  "CNBC",
  "Health",
  "Sports",
  "Bloomberg",
];

function buildTrendingTerms(articles: NewsArticle[]) {
  const counts = new Map<string, number>();

  articles.forEach((article) => {
    [article.source, article.category, article.title].forEach((term) => {
      const trimmedTerm = term?.trim();

      if (!trimmedTerm) {
        return;
      }

      const currentCount = counts.get(trimmedTerm) ?? 0;
      const weight = trimmedTerm === article.title ? 2 : 1;
      counts.set(trimmedTerm, currentCount + weight);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [trendingTerms, setTrendingTerms] = useState<string[]>(fallbackTrendingTerms);

  useEffect(() => {
    async function loadTrendingTerms() {
      try {
        const response = await fetch("/api/news");
        const news = (await response.json()) as NewsArticle[];
        const derivedTerms = buildTrendingTerms(news);

        if (derivedTerms.length > 0) {
          setTrendingTerms(derivedTerms);
        }
      } catch (error) {
        console.error("Error loading search trends:", error);
      }
    }

    loadTrendingTerms();
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!query.trim()) {
      return trendingTerms;
    }

    return trendingTerms.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, trendingTerms]);

  return (
    <section className="page-shell search-shell">
      <section className="section-card stack search-card">
        <label className="search-input-shell" htmlFor="search-input">
          <span className="search-input-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            id="search-input"
            className="search-input search-input-with-icon"
            type="text"
            placeholder="Search news, users, or companies..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {query.trim() ? (
          <div className="empty-state">
            <strong>Search preview</strong>
            <span>
              Your current search text is <strong>{query}</strong>. Hook this input
              into your search data when you’re ready.
            </span>
          </div>
        ) : null}
      </section>

      <section className="section-card stack">
        <div className="search-section-header">
          <strong>Trending Now</strong>
        </div>

        <div className="search-trending-list">
          {filteredSuggestions.map((item) => (
            <button
              key={item}
              className="search-trending-row"
              onClick={() => setQuery(item)}
            >
              <span className="search-trending-label">{item}</span>
              <span className="search-trending-icon" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
