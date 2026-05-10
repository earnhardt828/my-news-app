"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { cleanDisplayText } from "../../../lib/display-text";
import { supabase } from "../../../lib/supabase";

type SavedArticle = {
  id: number;
  article_id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  url?: string | null;
  image?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

function formatSavedArticleDate(article: SavedArticle) {
  const timestamp = article.published_at ?? article.created_at ?? null;

  if (!timestamp) {
    return article.time;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return article.time;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function ProfileBookmarksPage() {
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadBookmarks() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (!user?.id) {
        setSavedArticles([]);
        setMessage("Log in to view bookmarked articles.");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("saved_articles")
        .select(
          "id, article_id, title, source, url, image, category, time, published_at, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Error loading profile bookmarks:", error);
        setSavedArticles([]);
        setMessage(error.message ?? "Could not load bookmarked articles.");
        setIsLoading(false);
        return;
      }

      setSavedArticles((data ?? []) as SavedArticle[]);
      setMessage("");
      setIsLoading(false);
    }

    void loadBookmarks();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen label="Loading bookmarks" />
      ) : savedArticles.length === 0 ? (
        <div className="empty-state">
          <strong>No bookmarked articles yet</strong>
          <span>{message || "Save articles from the feed and they will appear here."}</span>
        </div>
      ) : (
        <section className="section-card stack">
          <div className="stack" style={{ gap: "6px" }}>
            <strong className="profile-section-title">All bookmarks</strong>
            <span className="muted">Saved stories from across your feed.</span>
          </div>

          <div className="comment-list">
            {savedArticles.map((article) => (
              <Link
                key={article.id}
                href={`/article/${article.article_id}`}
                className="comment-card profile-saved-article-card"
              >
                <div className="profile-saved-article-copy">
                  <strong className="profile-saved-article-title">
                    {cleanDisplayText(article.title)}
                  </strong>
                  <div className="comment-meta">
                    {article.source} · {formatSavedArticleDate(article)}
                  </div>
                </div>
                {article.image ? (
                  <div
                    className="profile-saved-article-thumb"
                    role="img"
                    aria-label={cleanDisplayText(article.title)}
                    style={{ backgroundImage: `url(${article.image})` }}
                  />
                ) : (
                  <div className="profile-saved-article-thumb profile-saved-article-thumb-placeholder">
                    {article.source.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
