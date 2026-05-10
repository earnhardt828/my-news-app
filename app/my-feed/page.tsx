"use client";

import AdSlot from "../components/ad-slot";
import ArticleReaderButton from "../components/article-reader-button";
import SourceBadge from "../components/source-badge";
import SourcePreferenceSheet from "../components/source-preference-sheet";
import Link from "next/link";
import { useEffect, useState } from "react";
import ShareButton from "../components/share-button";
import { apiFetch } from "../../lib/api-base";
import { getCategoryLabel } from "../../lib/categories";
import { cleanDisplayText } from "../../lib/display-text";
import { rankArticlesWithSourcePreferences } from "../../lib/feed-ranking";
import { ensureProfileRow, saveProfilePatch } from "../../lib/profile-store";
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

type DbSourceRating = {
  source_name: string;
  rating: "like" | "dislike";
};

export default function MyFeed() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeSaveArticleId, setActiveSaveArticleId] = useState<number | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  const [isSavingSourcePreference, setIsSavingSourcePreference] = useState(false);
  const [sourcePreferenceStatus, setSourcePreferenceStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadFeed() {
      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.id) {
        setUserId(null);
        setUserEmail(null);
        setArticles([]);
        setCategories([]);
        setPreferredSources([]);
        setShowLessSources([]);
        setIsLoading(false);
        return;
      }

      setUserId(userData.user.id);
      setUserEmail(userData.user.email ?? null);

      const { data: profile, error: profileError } = await ensureProfileRow({
        id: userData.user.id,
        email: userData.user.email ?? null,
      });

      if (profileError) {
        console.error("Error loading My Feed profile:", profileError);
      }

      const userCategories = profile?.categories ?? [];
      setCategories(userCategories);
      setPreferredSources(profile?.preferred_sources ?? []);
      setShowLessSources(profile?.show_less_sources ?? []);

      const res = await apiFetch("/api/news");
      const news = (await res.json()) as Omit<FeedArticle, "saved">[];

      const { data: savedArticlesData } = await supabase
        .from("saved_articles")
        .select("article_id")
        .eq("user_id", userData.user.id);
      const { data: sourceRatingsData } = await supabase
        .from("source_ratings")
        .select("source_name, rating")
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
          likedSources: ((sourceRatingsData ?? []) as DbSourceRating[])
            .filter((rating) => rating.rating === "like")
            .map((rating) => rating.source_name),
          dislikedSources: ((sourceRatingsData ?? []) as DbSourceRating[])
            .filter((rating) => rating.rating === "dislike")
            .map((rating) => rating.source_name),
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
        title: cleanDisplayText(article.title),
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

  const handleSaveSourcePreference = async (sourceName: string, mode: "prefer" | "show-less") => {
    if (!userId) {
      setSourcePreferenceStatus({
        type: "error",
        text: "Log in to customize sources.",
      });
      return;
    }

    const nextPreferredSources =
      mode === "prefer"
        ? preferredSources.includes(sourceName)
          ? preferredSources.filter((current) => current !== sourceName)
          : [...preferredSources, sourceName]
        : preferredSources.filter((current) => current !== sourceName);
    const nextShowLessSources =
      mode === "show-less"
        ? showLessSources.includes(sourceName)
          ? showLessSources.filter((current) => current !== sourceName)
          : [...showLessSources, sourceName]
        : showLessSources.filter((current) => current !== sourceName);

    setIsSavingSourcePreference(true);
    setSourcePreferenceStatus(null);

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: userEmail,
      },
      {
        id: userId,
        email: userEmail,
        categories,
        preferred_sources: nextPreferredSources,
        show_less_sources: nextShowLessSources,
      }
    );

    setIsSavingSourcePreference(false);

    if (error) {
      console.error("Error saving source preference:", error);
      setSourcePreferenceStatus({
        type: "error",
        text: error.message ?? "Could not save source preference.",
      });
      return;
    }

    setPreferredSources(nextPreferredSources);
    setShowLessSources(nextShowLessSources);
    setSourcePreferenceStatus({
      type: "success",
      text: "Source preference updated.",
    });
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
                {getCategoryLabel(category)}
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="loading-state">
          <strong>Loading your feed...</strong>
          <span>Pulling in stories for your selected categories.</span>
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
                <button
                  type="button"
                  className="source-trigger my-feed-source-trigger"
                  onClick={() => {
                    setActiveSourceName(article.source);
                    setSourcePreferenceStatus(null);
                  }}
                >
                  <div className="trending-source-brand">
                    <SourceBadge sourceName={article.source} />
                    <span className="trending-source-name">{article.source}</span>
                  </div>
                </button>
                <Link href={`/article/${article.id}`} className="article-link">
                  {article.image ? (
                    <img
                      src={article.image}
                      alt={cleanDisplayText(article.title)}
                      className="article-image"
                    />
                  ) : null}

                  <div className="news-card-header">
                    <div className="news-meta">
                      <span className="chip chip-accent">{getCategoryLabel(article.category)}</span>
                      <span>{article.publishedAt ?? article.time}</span>
                    </div>
                  </div>

                  <h3 className="article-title">{cleanDisplayText(article.title)}</h3>
                </Link>

                <div className="engagement-row">
                  <ArticleReaderButton
                    title={cleanDisplayText(article.title)}
                    url={article.url}
                  />
                  <ShareButton
                    path={`/article/${article.id}`}
                    title={cleanDisplayText(article.title)}
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

      <SourcePreferenceSheet
        sourceName={activeSourceName}
        isOpen={activeSourceName !== null}
        isPreferred={activeSourceName ? preferredSources.includes(activeSourceName) : false}
        isShowLess={activeSourceName ? showLessSources.includes(activeSourceName) : false}
        isSaving={isSavingSourcePreference}
        status={sourcePreferenceStatus}
        onPrefer={() => {
          if (activeSourceName) {
            void handleSaveSourcePreference(activeSourceName, "prefer");
          }
        }}
        onShowLess={() => {
          if (activeSourceName) {
            void handleSaveSourcePreference(activeSourceName, "show-less");
          }
        }}
        onClose={() => {
          if (isSavingSourcePreference) {
            return;
          }

          setActiveSourceName(null);
          setSourcePreferenceStatus(null);
        }}
      />

    </section>
  );
}
