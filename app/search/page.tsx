"use client";

import { useMemo, useState } from "react";

const suggestions = [
  "CNN",
  "Tech",
  "Business",
  "Sports",
  "World",
  "Top users",
];

export default function Search() {
  const [query, setQuery] = useState("");

  const filteredSuggestions = useMemo(() => {
    if (!query.trim()) {
      return suggestions;
    }

    return suggestions.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Search Hub</p>
        <h2 className="page-title">Find users, posts, and publishers.</h2>
        <p className="page-subtitle">
          Start with a source like CNN, a category, or a person you want to
          follow.
        </p>
      </div>

      <section className="section-card stack">
        <input
          className="search-input"
          type="text"
          placeholder="Search news, users, or companies..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {query.trim() ? (
          <div className="empty-state">
            <strong>Search preview</strong>
            <span>
              Your current search text is <strong>{query}</strong>. Hook this input
              into your search data when you’re ready.
            </span>
          </div>
        ) : (
          <div className="stack">
            <strong>Popular searches</strong>
            <div className="category-grid">
              {filteredSuggestions.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
