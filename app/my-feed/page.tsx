"use client";

import AdSlot from "../components/ad-slot";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type FeedArticle = {
  id: number;
  title: string;
  source: string;
  category: string;
};

export default function MyFeed() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFeed() {
      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.id) {
        setArticles([]);
        setCategories([]);
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("categories")
        .eq("id", userData.user.id)
        .maybeSingle();

      const userCategories = profile?.categories ?? [];
      setCategories(userCategories);

      const res = await fetch("/api/news");
      const news = (await res.json()) as FeedArticle[];

      const filtered =
        userCategories.length > 0
          ? news.filter((item) => userCategories.includes(item.category))
          : news;

      setArticles(filtered);
      setIsLoading(false);
    }

    loadFeed();
  }, []);

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Personalized</p>
        <h2 className="page-title">Your categories, your pace.</h2>
        <p className="page-subtitle">
          My Feed pulls in live stories based on the categories you selected in
          Profile.
        </p>
      </div>

      <div className="section-card stack">
        <strong>Following</strong>
        {categories.length === 0 ? (
          <div className="empty-state">
            <strong>No categories selected</strong>
            <span>Go to Profile and pick categories to personalize this feed.</span>
          </div>
        ) : (
          <div className="category-grid">
            {categories.map((category) => (
              <span key={category} className="chip chip-accent">
                {category}
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="loading-state">
          <strong>Loading your feed</strong>
          <span>Matching live headlines to the categories you follow.</span>
        </div>
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <strong>No articles found</strong>
          <span>Try adding more categories or check back when new stories land.</span>
        </div>
      ) : (
        <div className="stack">
          {articles.map((article, index) => (
            <div key={article.id} className="stack">
              <article className="news-card">
                <div className="news-card-header">
                  <div className="news-meta">
                    <span className="chip chip-accent">{article.category}</span>
                    <span>{article.source}</span>
                  </div>
                </div>

                <h3 className="article-title">{article.title}</h3>
              </article>

              {(index + 1) % 3 === 0 ? (
                <AdSlot
                  title="Sponsored placement"
                  copy="Personalized feed ad placeholder that keeps the layout balanced on mobile."
                  cta="Featured placement"
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

    </section>
  );
}
