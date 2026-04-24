"use client";

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

  useEffect(() => {
    async function loadFeed() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.id) {
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
      const news = await res.json();

      const filtered =
        userCategories.length > 0
          ? news.filter((item: FeedArticle) => userCategories.includes(item.category))
          : news;

      setArticles(filtered);
    }

    loadFeed();
  }, []);

  return (
    <main style={{ maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold" }}>My Feed</h1>

      {categories.length === 0 ? (
        <p style={{ marginTop: "10px", color: "#666" }}>
          Go to Profile and pick categories first.
        </p>
      ) : (
        <p style={{ marginTop: "10px", color: "#666" }}>
          Showing: {categories.join(", ")}
        </p>
      )}

      <div style={{ marginTop: "20px", display: "grid", gap: "16px" }}>
        {articles.map((article) => (
          <div
            key={article.id}
            style={{
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "10px",
              backgroundColor: "white",
              color: "black",
            }}
          >
            <h2>{article.title}</h2>
            <p style={{ color: "#666" }}>
              {article.category} · {article.source}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
