"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import HeartIcon from "../../components/heart-icon";
import LoadingScreen from "../../components/loading-screen";
import { apiFetch } from "../../../lib/api-base";
import { cleanDisplayText } from "../../../lib/display-text";
import { POLL_PUBLIC_STATUSES } from "../../../lib/polls";
import { supabase } from "../../../lib/supabase";
import { extractVideoIdFromUrl } from "../../../lib/video-feed";

type MyComment = {
  id: number | string;
  kind: "article" | "poll";
  text: string;
  article_id: number | string;
  article_title: string;
  article_source?: string | null;
  article_image?: string | null;
  article_url?: string | null;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  hearts: number;
};

type RawProfileComment = {
  id: number;
  text: string;
  article_id: number | string;
  article_title?: string | null;
  article_source?: string | null;
  article_image?: string | null;
  article_url?: string | null;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type RawPollProfileComment = {
  id: string;
  poll_id: string;
  user_id: string | null;
  username: string | null;
  text: string;
  created_at: string | null;
};

function normalizeArticleId(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function warnCommentReactionsLoad(error: unknown) {
  const reactionError = (error ?? {}) as {
    message?: string | null;
    code?: string | null;
    details?: string | null;
  };

  console.warn("COMMENT_REACTIONS_LOAD_WARNING", {
    message: reactionError.message ?? null,
    code: reactionError.code ?? null,
    details: reactionError.details ?? null,
  });
}

function resolveCommentArticleTitle(
  comment: {
    article_id: number | string;
    article_title?: string | null;
    article_url?: string | null;
  },
  articleTitleLookup: Map<number, string>,
  articleUrlLookup: Map<string, string>
) {
  const normalizedStoredTitle = comment.article_title?.replace(/\s+/g, " ").trim();
  const normalizedArticleUrl = comment.article_url?.trim() ?? "";
  const normalizedArticleId = normalizeArticleId(comment.article_id);

  return (
    cleanDisplayText(normalizedStoredTitle) ||
    cleanDisplayText(
      normalizedArticleId !== null ? articleTitleLookup.get(normalizedArticleId) : null
    ) ||
    cleanDisplayText(normalizedArticleUrl ? articleUrlLookup.get(normalizedArticleUrl) : null) ||
    "Article"
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

function ReactionSummary({ hearts }: { hearts: number }) {
  return (
    <div className="profile-comment-reaction-summary">
      <span className="profile-comment-reaction-item">
        <HeartIcon size={16} strokeWidth={1.9} />
        <span>{hearts}</span>
      </span>
    </div>
  );
}

function getCommentDetailPath(comment: {
  kind: "article" | "poll";
  article_id: number | string;
  article_url?: string | null;
  id: number | string;
}) {
  if (comment.kind === "poll") {
    return `/poll/${comment.article_id}#comment-${comment.id}`;
  }

  const videoId = extractVideoIdFromUrl(comment.article_url);

  if (videoId) {
    return `/video/${videoId}#comment-${comment.id}`;
  }

  return `/article/${comment.article_id}#comment-${comment.id}`;
}

export default function ProfileCommentsPage() {
  const router = useRouter();
  const [comments, setComments] = useState<MyComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeDeleteId, setActiveDeleteId] = useState<string | null>(null);

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

      const [commentsRes, reactionsRes, newsRes, pollCommentsRes, pollsRes] = await Promise.allSettled([
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
        apiFetch("/api/news"),
        supabase
          .from("poll_comments")
          .select("id, poll_id, user_id, username, text, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("polls")
          .select("id, question")
          .in("status", [...POLL_PUBLIC_STATUSES]),
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
        warnCommentReactionsLoad(reactionsRes.reason);
      } else if (reactionsRes.value.error) {
        warnCommentReactionsLoad(reactionsRes.value.error);
      }

      const newsArticles =
        newsRes.status === "fulfilled" && newsRes.value.ok
          ? ((((await newsRes.value.json()) as {
              id: number;
              title: string;
              url?: string | null;
            }[]) ?? []))
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
        newsArticles
          .map((article) => [normalizeArticleId(article.id), article.title] as const)
          .filter((entry): entry is [number, string] => entry[0] !== null)
      );
      const articleUrlLookup = new Map(
        newsArticles
          .filter(
            (article): article is { id: number; title: string; url: string } =>
              Boolean(article.url?.trim())
          )
          .map((article) => [article.url.trim(), article.title])
      );

      const pollTitleLookup = new Map(
        (
          pollCommentsRes.status === "fulfilled" && pollsRes.status === "fulfilled"
            ? (((pollsRes.value.data ?? []) as { id: string; question: string }[]) ?? [])
            : []
        ).map((poll) => [poll.id, cleanDisplayText(poll.question)])
      );

      const enrichedArticleComments = ((commentsRes.value.data ?? []) as RawProfileComment[]).map((comment) => ({
        ...comment,
        kind: "article" as const,
        article_title: resolveCommentArticleTitle(comment, articleTitleLookup, articleUrlLookup),
        hearts: reactions.filter(
          (reaction) => reaction.comment_id === comment.id && reaction.reaction_type === "like"
        ).length,
      }));

      const enrichedPollComments =
        pollCommentsRes.status === "fulfilled" && !pollCommentsRes.value.error
          ? (((pollCommentsRes.value.data ?? []) as RawPollProfileComment[]) ?? []).map((comment) => ({
              id: comment.id,
              kind: "poll" as const,
              text: cleanDisplayText(comment.text),
              article_id: comment.poll_id,
              article_title: pollTitleLookup.get(comment.poll_id) ?? "Poll",
              article_source: null,
              article_image: null,
              article_url: null,
              username: comment.username,
              user_id: comment.user_id,
              created_at: comment.created_at,
              hearts: 0,
            }))
          : [];

      setComments(
        [...enrichedArticleComments, ...enrichedPollComments].sort((left, right) => {
          const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
          const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
          return rightTime - leftTime;
        })
      );
      setMessage("");
      setIsLoading(false);
    }

    void loadComments();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDeleteComment = async (comment: MyComment) => {
    setActiveDeleteId(`${comment.kind}:${comment.id}`);

    const query =
      comment.kind === "poll"
        ? supabase.from("poll_comments").delete().eq("id", String(comment.id))
        : supabase.from("comments").delete().eq("id", Number(comment.id));

    const { error } = await query;

    setActiveDeleteId(null);

    if (error) {
      console.error("Error deleting profile comment:", error);
      setMessage(error.message ?? "Could not delete comment.");
      return;
    }

    setComments((prev) =>
      prev.filter(
        (current) => !(current.kind === comment.kind && String(current.id) === String(comment.id))
      )
    );
  };

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
            <span className="muted">Your recent conversations across Graffiti.</span>
          </div>

          <div className="comment-list">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="comment-card profile-comment-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  router.push(getCommentDetailPath(comment));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(getCommentDetailPath(comment));
                  }
                }}
              >
                <div className="profile-comment-toprow">
                  <strong className="profile-comment-article-title">
                    {cleanDisplayText(comment.article_title)}
                  </strong>
                  <button
                    type="button"
                    className="button button-secondary profile-comment-delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteComment(comment);
                    }}
                    disabled={activeDeleteId === `${comment.kind}:${comment.id}`}
                  >
                    {activeDeleteId === `${comment.kind}:${comment.id}` ? "Deleting..." : "Delete"}
                  </button>
                </div>
                <div className="comment-body">
                  <strong>{comment.username ?? "You"}</strong>{" "}
                  <span className="muted">{comment.text}</span>
                </div>
                <div className="profile-comment-footer">
                  <div className="comment-meta">
                    {formatRelativeTime(comment.created_at)}
                  </div>
                  <ReactionSummary hearts={comment.hearts} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
