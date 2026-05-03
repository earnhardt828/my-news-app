"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { supabase } from "../../../lib/supabase";

type MyComment = {
  id: number;
  text: string;
  article_id: number;
  article_title: string;
  article_source?: string | null;
  article_image?: string | null;
  article_url?: string | null;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  likes: number;
  dislikes: number;
};

type RawProfileComment = Omit<MyComment, "likes" | "dislikes" | "article_title"> & {
  article_title?: string | null;
};

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function resolveCommentArticleTitle(
  comment: {
    article_id: number;
    article_title?: string | null;
  },
  articleTitleLookup: Map<number, string>
) {
  return (
    comment.article_title?.trim() ||
    articleTitleLookup.get(comment.article_id) ||
    "Article unavailable"
  );
}

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Just now";
  }

  const createdAt = new Date(timestamp).getTime();

  if (Number.isNaN(createdAt)) {
    return "Just now";
  }

  const diffMs = Date.now() - createdAt;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function ReactionSummary({ likes, dislikes }: { likes: number; dislikes: number }) {
  return (
    <div className="profile-comment-reaction-summary">
      <span className="profile-comment-reaction-item">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 11v8" />
          <path d="M11 19h6.2a2 2 0 0 0 1.9-1.4l1.2-4a2 2 0 0 0-1.9-2.6H14V6.8c0-1-.8-1.8-1.8-1.8-.6 0-1.1.3-1.5.8L7 11Z" />
        </svg>
        <span>{likes}</span>
      </span>
      <span className="profile-comment-reaction-item">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 13V5" />
          <path d="M13 5H6.8a2 2 0 0 0-1.9 1.4l-1.2 4a2 2 0 0 0 1.9 2.6H10v4.2c0 1 .8 1.8 1.8 1.8.6 0 1.1-.3 1.5-.8L17 13Z" />
        </svg>
        <span>{dislikes}</span>
      </span>
    </div>
  );
}

export default function ProfileCommentsPage() {
  const router = useRouter();
  const [comments, setComments] = useState<MyComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadComments() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (!user?.id) {
        setComments([]);
        setMessage("Log in to view your comments.");
        setIsLoading(false);
        return;
      }

      const [commentsRes, reactionsRes, newsRes] = await Promise.allSettled([
        (async () => {
          let response: {
            data: RawProfileComment[] | null;
            error: { message?: string | null } | null;
          } = await supabase
            .from("comments")
            .select(
              "id, text, article_id, article_title, article_source, article_image, article_url, username, user_id, created_at"
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (
            response.error &&
            isMissingCommentMetadataColumnError(response.error.message)
          ) {
            console.error(
              "Profile comments metadata columns are missing, retrying with base columns:",
              response.error
            );

            response = await supabase
              .from("comments")
              .select("id, text, article_id, username, user_id, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false });
          }

          return response;
        })(),
        supabase.from("comment_reactions").select("comment_id, reaction_type"),
        fetch("/api/news"),
      ]);

      if (!isMounted) {
        return;
      }

      if (commentsRes.status === "rejected") {
        console.error("Error loading profile comments:", commentsRes.reason);
        setComments([]);
        setMessage("Could not load comments.");
        setIsLoading(false);
        return;
      }

      if (commentsRes.value.error) {
        console.error("Error loading profile comments:", commentsRes.value.error);
        setComments([]);
        setMessage(commentsRes.value.error.message ?? "Could not load comments.");
        setIsLoading(false);
        return;
      }

      const reactions =
        reactionsRes.status === "fulfilled" && !reactionsRes.value.error
          ? reactionsRes.value.data ?? []
          : [];

      if (reactionsRes.status === "rejected") {
        console.error("Error loading comment reactions:", reactionsRes.reason);
      } else if (reactionsRes.value.error) {
        console.error("Error loading comment reactions:", reactionsRes.value.error);
      }

      const newsArticles =
        newsRes.status === "fulfilled" && newsRes.value.ok
          ? ((((await newsRes.value.json()) as { id: number; title: string }[]) ?? []))
          : [];

      if (newsRes.status === "rejected") {
        console.error("Error loading article titles for profile comments:", newsRes.reason);
      } else if (!newsRes.value.ok) {
        console.error("Error loading article titles for profile comments:", {
          status: newsRes.value.status,
          statusText: newsRes.value.statusText,
        });
      }

      const articleTitleLookup = new Map(
        newsArticles.map((article) => [article.id, article.title])
      );

      const enrichedComments = ((commentsRes.value.data ?? []) as RawProfileComment[]).map((comment) => ({
        ...comment,
        article_title: resolveCommentArticleTitle(comment, articleTitleLookup),
        likes: reactions.filter(
          (reaction) =>
            reaction.comment_id === comment.id && reaction.reaction_type === "like"
        ).length,
        dislikes: reactions.filter(
          (reaction) =>
            reaction.comment_id === comment.id && reaction.reaction_type === "dislike"
        ).length,
      }));

      setComments(enrichedComments);
      setMessage("");
      setIsLoading(false);
    }

    void loadComments();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen label="Loading comments" />
      ) : comments.length === 0 ? (
        <div className="empty-state">
          <strong>No comments yet</strong>
          <span>{message || "Your comments on articles will show up here."}</span>
        </div>
      ) : (
        <section className="section-card stack">
          <div className="stack" style={{ gap: "6px" }}>
            <strong className="profile-section-title">All comments</strong>
            <span className="muted">Your recent conversations across Reflekt.</span>
          </div>

          <div className="comment-list">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="comment-card profile-comment-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  router.push(`/article/${comment.article_id}#comment-${comment.id}`);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/article/${comment.article_id}#comment-${comment.id}`);
                  }
                }}
              >
                <div className="profile-comment-toprow">
                  <strong className="profile-comment-article-title">
                    {comment.article_title}
                  </strong>
                </div>
                <div className="comment-body">
                  <strong>{comment.username ?? "You"}</strong>{" "}
                  <span className="muted">{comment.text}</span>
                </div>
                <div className="profile-comment-footer">
                  <div className="comment-meta">
                    {formatRelativeTime(comment.created_at)}
                  </div>
                  <ReactionSummary likes={comment.likes} dislikes={comment.dislikes} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
