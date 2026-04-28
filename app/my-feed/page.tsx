"use client";

import AdSlot from "../components/ad-slot";
import ArticleReaderButton from "../components/article-reader-button";
import Link from "next/link";
import { useEffect, useState } from "react";
import ShareButton from "../components/share-button";
import { rankArticlesWithSourcePreferences } from "../../lib/feed-ranking";
import { supabase } from "../../lib/supabase";

type FeedArticle = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  image?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  saved: boolean;
};

type SavedArticleRecord = {
  article_id: number;
};

function FeedSkeleton() {
  return (
    <div className="stack">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="skeleton-card">
          <div className="skeleton-meta-row">
            <div className="skeleton-line skeleton-chip" />
            <div className="skeleton-line skeleton-body-sm" />
          </div>

          <div className="stack" style={{ gap: "8px" }}>
            <div className="skeleton-line skeleton-title-lg skeleton-body-lg" />
            <div className="skeleton-line skeleton-title skeleton-body-md" />
          </div>

          <div className="skeleton-action-row">
            <div className="skeleton-line skeleton-button" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyFeed() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSaveArticleId, setActiveSaveArticleId] = useState<number | null>(null);

  useEffect(() => {
    async function loadFeed() {
      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.id) {
        setUserId(null);
        setArticles([]);
        setCategories([]);
        setIsLoading(false);
        return;
      }

      setUserId(userData.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("categories, preferred_sources, show_less_sources")
        .eq("id", userData.user.id)
        .maybeSingle();

      const userCategories = profile?.categories ?? [];
      setCategories(userCategories);

      const res = await fetch("/api/news");
      const news = (await res.json()) as Omit<FeedArticle, "saved">[];

      const { data: savedArticlesData } = await supabase
        .from("saved_articles")
        .select("article_id")
        .eq("user_id", userData.user.id);

      const savedArticleIds = new Set(
        ((savedArticlesData ?? []) as SavedArticleRecord[]).map(
          (savedArticle) => savedArticle.article_id
        )
      );

      const filtered =
        userCategories.length > 0
          ? news.filter((item) => userCategories.includes(item.category))
          : news;

      const ranked = rankArticlesWithSourcePreferences(
        filtered.map((article) => ({
          ...article,
          saved: savedArticleIds.has(article.id),
        })),
        {
          preferredSources: profile?.preferred_sources ?? [],
          showLessSources: profile?.show_less_sources ?? [],
          mode: "my-feed",
        }
      );

      setArticles(ranked);
      setIsLoading(false);
    }

    loadFeed();
  }, []);

  const handleToggleSaveArticle = async (article: FeedArticle) => {
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
        title: article.title,
        source: article.source,
        category: article.category,
        time: article.time,
        url: article.url ?? null,
        image: article.image ?? null,
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
        <FeedSkeleton />
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
                <Link href={`/article/${article.id}`} className="article-link">
                  {article.image ? (
                    <img
                      src={article.image}
                      alt={article.title}
                      className="article-image"
                    />
                  ) : null}

                  <div className="news-card-header">
                    <div className="news-meta">
                      <span className="chip chip-accent">{article.category}</span>
                      <span>{article.source}</span>
                      <span>{article.publishedAt ?? article.time}</span>
                    </div>
                  </div>

                  <h3 className="article-title">{article.title}</h3>
                </Link>

                <div className="engagement-row">
                  <ArticleReaderButton title={article.title} url={article.url} />
                  <ShareButton
                    path={`/article/${article.id}`}
                    title={article.title}
                    url={article.url}
                  />
                  <button
                    className="button button-secondary"
                    onClick={() => handleToggleSaveArticle(article)}
                    disabled={activeSaveArticleId === article.id}
                  >
                    {activeSaveArticleId === article.id
                      ? "Saving..."
                      : article.saved
                        ? "Unsave"
                        : "Save"}
                  </button>
                </div>
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
