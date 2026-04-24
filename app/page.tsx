"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Comment = {
  id: number;
  text: string;
  username: string | null;
};

type Article = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  likes: number;
  comments: Comment[];
};

type DbComment = {
  id: number;
  article_id: number;
  text: string;
  username: string | null;
};

type DbLike = {
  id: number;
  article_id: number;
};

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<"latest" | "trending">("latest");
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNewsAndEngagement() {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);

      if (userData.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userData.user.id)
          .maybeSingle();

        setUsername(profile?.username ?? null);
      } else {
        setUsername(null);
      }

      const newsRes = await fetch("/api/news");
      const newsData = await newsRes.json();

      const { data: likesData } = await supabase
        .from("likes")
        .select("id, article_id");

      const { data: commentsData } = await supabase
        .from("comments")
        .select("id, article_id, text, username");

      const likes = (likesData ?? []) as DbLike[];
      const comments = (commentsData ?? []) as DbComment[];

      const mergedArticles: Article[] = newsData.map((item: Omit<Article, "likes" | "comments">) => {
        const articleLikes = likes.filter((like) => like.article_id === item.id).length;

        const articleComments = comments
          .filter((comment) => comment.article_id === item.id)
          .map((comment) => ({
            id: comment.id,
            text: comment.text,
            username: comment.username,
          }));

        return {
          ...item,
          likes: articleLikes,
          comments: articleComments,
        };
      });

      setArticles(mergedArticles);
    }

    fetchNewsAndEngagement();
  }, []);

  const handleLike = async (articleId: number) => {
    if (!userId) {
      alert("Log in to like posts");
      return;
    }

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      alert("You already liked this");
      return;
    }

    const { error } = await supabase.from("likes").insert({
      article_id: articleId,
      user_id: userId,
    });

    if (error) {
      console.error("Error saving like:", error);
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? { ...article, likes: article.likes + 1 }
          : article
      )
    );
  };

  const handleCommentInputChange = (articleId: number, value: string) => {
    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: value,
    }));
  };

  const handleAddComment = async (articleId: number) => {
    const text = commentInputs[articleId]?.trim();

    if (!text) return;

    if (!userId) {
      alert("Log in to comment");
      return;
    }

    if (!username) {
      alert("Set a username on your Profile page first");
      return;
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        article_id: articleId,
        text,
        user_id: userId,
        username,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving comment:", error);
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: [
                ...article.comments,
                {
                  id: data.id,
                  text: data.text,
                  username: data.username,
                },
              ],
            }
          : article
      )
    );

    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: "",
    }));
  };

  const displayedArticles = useMemo(() => {
    const copied = [...articles];

    if (sortMode === "latest") {
      return copied.sort((a, b) => b.id - a.id);
    }

    return copied.sort((a, b) => {
      const scoreA = a.likes + a.comments.length * 2;
      const scoreB = b.likes + b.comments.length * 2;
      return scoreB - scoreA;
    });
  }, [articles, sortMode]);

  return (
    <main style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: "bold" }}>Latest News</h1>
          <p style={{ marginTop: "8px", color: "#666" }}>
            News loaded from your API route.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setSortMode("latest")}>Latest</button>
          <button onClick={() => setSortMode("trending")}>Trending</button>
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
        {displayedArticles.map((article) => (
          <div
            key={article.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "20px",
              backgroundColor: "white",
              color: "black",
            }}
          >
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
              {article.category} · {article.source} · {article.time}
            </p>

            <h2
              style={{
                fontSize: "22px",
                fontWeight: "bold",
                marginBottom: "12px",
              }}
            >
              {article.title}
            </h2>

            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              <button onClick={() => handleLike(article.id)}>👍 Like</button>
              <span>{article.likes} likes</span>
              <span>💬 {article.comments.length} comments</span>
            </div>

            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "bold" }}>Comments</h3>

              <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                {article.comments.length === 0 ? (
                  <p style={{ color: "#666" }}>No comments yet.</p>
                ) : (
                  article.comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "10px",
                        border: "1px solid #eee",
                        borderRadius: "8px",
                      }}
                    >
                      <strong>{comment.username ?? "Unknown"}:</strong>{" "}
                      {comment.text}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={commentInputs[article.id] || ""}
                  onChange={(e) =>
                    handleCommentInputChange(article.id, e.target.value)
                  }
                  style={{
                    flex: 1,
                    minWidth: "220px",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    color: "black",
                    backgroundColor: "white",
                  }}
                />

                <button onClick={() => handleAddComment(article.id)}>
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
