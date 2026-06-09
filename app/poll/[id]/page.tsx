"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import HeartIcon from "../../components/heart-icon";
import LoadingScreen from "../../components/loading-screen";
import PollCard from "../../components/poll-card";
import { hydratePolls, type PollRecord, type PollWithResults } from "../../../lib/polls";
import { cleanDisplayText } from "../../../lib/display-text";
import { supabase } from "../../../lib/supabase";

type PollCommentRecord = {
  id: string;
  poll_id: string;
  user_id: string;
  username: string | null;
  text: string;
  created_at: string | null;
};

type PollComment = PollCommentRecord & {
  avatar_url: string | null;
};

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Recent";
  }

  const parsed = new Date(timestamp).getTime();

  if (Number.isNaN(parsed)) {
    return "Recent";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));

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

  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function PollDetailPage() {
  const params = useParams<{ id: string }>();
  const pollId = decodeURIComponent(params.id ?? "");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [poll, setPoll] = useState<PollWithResults | null>(null);
  const [comments, setComments] = useState<PollComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [isHeartLoading, setIsHeartLoading] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadPollPage() {
      if (!pollId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setStatus(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerId(user?.id ?? null);

      const { data: pollRow, error: pollError } = await supabase
        .from("polls")
        .select(
          "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
        )
        .eq("id", pollId)
        .eq("status", "active")
        .maybeSingle();

      if (pollError) {
        console.error("Error loading poll:", pollError);
        setPoll(null);
        setComments([]);
        setIsLoading(false);
        return;
      }

      if (!pollRow) {
        setPoll(null);
        setComments([]);
        setIsLoading(false);
        return;
      }

      const hydratedPolls = await hydratePolls(
        supabase,
        [pollRow as PollRecord],
        user?.id ?? null
      );
      setPoll(hydratedPolls[0] ?? null);

      const { data: commentRows, error: commentsError } = await supabase
        .from("poll_comments")
        .select("id, poll_id, user_id, username, text, created_at")
        .eq("poll_id", pollId)
        .order("created_at", { ascending: false });

      if (commentsError) {
        console.error("Error loading poll comments:", commentsError);
        setComments([]);
        setIsLoading(false);
        return;
      }

      const commentUserIds = Array.from(
        new Set(((commentRows ?? []) as PollCommentRecord[]).map((comment) => comment.user_id))
      );
      const { data: profileRows, error: profileError } = commentUserIds.length
        ? await supabase.from("profiles").select("id, avatar_url").in("id", commentUserIds)
        : { data: [], error: null };

      if (profileError) {
        console.error("Error loading poll comment avatars:", profileError);
      }

      const avatarByUserId = new Map(
        (((profileRows ?? []) as { id: string; avatar_url: string | null }[]) ?? []).map(
          (profileRow) => [profileRow.id, profileRow.avatar_url ?? null]
        )
      );

      setComments(
        (((commentRows ?? []) as PollCommentRecord[]) ?? []).map((comment) => ({
          ...comment,
          text: cleanDisplayText(comment.text),
          avatar_url: avatarByUserId.get(comment.user_id) ?? null,
        }))
      );
      setIsLoading(false);
    }

    void loadPollPage();
  }, [pollId]);

  const creatorLabel = poll?.username ? `@${poll.username}` : "Graffiti Poll";
  const commentsTitle = useMemo(() => `Comments (${comments.length})`, [comments.length]);
  const relatedArticleHref =
    poll?.related_article_id ? `/article/${encodeURIComponent(poll.related_article_id)}` : null;

  const handleVote = async (targetPollId: string, optionId: string) => {
    if (!viewerId) {
      setStatus({ type: "error", text: "Log in to vote in polls." });
      return;
    }

    if (!poll || poll.id !== targetPollId || poll.userVoteOptionId) {
      return;
    }

    setIsVoting(true);
    setStatus(null);

    const { error } = await supabase.from("poll_votes").insert({
      poll_id: targetPollId,
      option_id: optionId,
      user_id: viewerId,
    });

    setIsVoting(false);

    if (error) {
      console.error("Error saving poll vote:", error);
      setStatus({ type: "error", text: error.message ?? "Could not save your vote." });
      return;
    }

    setPoll((prev) => {
      if (!prev) {
        return prev;
      }

      const nextTotalVotes = prev.totalVotes + 1;

      return {
        ...prev,
        totalVotes: nextTotalVotes,
        userVoteOptionId: optionId,
        options: prev.options.map((option) => {
          const voteCount = option.id === optionId ? option.voteCount + 1 : option.voteCount;

          return {
            ...option,
            voteCount,
            percentage: nextTotalVotes > 0 ? Math.round((voteCount / nextTotalVotes) * 100) : 0,
          };
        }),
      };
    });
  };

  const handleToggleHeart = async () => {
    if (!viewerId) {
      setStatus({ type: "error", text: "Log in to heart polls." });
      return;
    }

    if (!poll) {
      return;
    }

    setIsHeartLoading(true);
    setStatus(null);

    if (poll.userHasHearted) {
      const { error } = await supabase
        .from("poll_hearts")
        .delete()
        .eq("poll_id", poll.id)
        .eq("user_id", viewerId);

      setIsHeartLoading(false);

      if (error) {
        console.error("Error removing poll heart:", error);
        setStatus({ type: "error", text: error.message ?? "Could not remove your heart." });
        return;
      }

      setPoll((prev) =>
        prev ? { ...prev, userHasHearted: false, heartCount: Math.max(0, prev.heartCount - 1) } : prev
      );
      return;
    }

    const { error } = await supabase.from("poll_hearts").insert({
      poll_id: poll.id,
      user_id: viewerId,
    });

    setIsHeartLoading(false);

    if (error) {
      console.error("Error saving poll heart:", error);
      setStatus({ type: "error", text: error.message ?? "Could not heart this poll." });
      return;
    }

    setPoll((prev) =>
      prev ? { ...prev, userHasHearted: true, heartCount: prev.heartCount + 1 } : prev
    );
  };

  const handleSubmitComment = async () => {
    if (!viewerId) {
      setStatus({ type: "error", text: "Log in to comment on polls." });
      return;
    }

    if (!poll) {
      return;
    }

    const nextComment = cleanDisplayText(commentInput).replace(/\s+/g, " ").trim();

    if (!nextComment) {
      setStatus({ type: "error", text: "Write a comment first." });
      return;
    }

    setIsSubmittingComment(true);
    setStatus(null);

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", viewerId)
      .maybeSingle();

    const { data: insertedComment, error } = await supabase
      .from("poll_comments")
      .insert({
        poll_id: poll.id,
        user_id: viewerId,
        username: profileRow?.username ?? null,
        text: nextComment,
      })
      .select("id, poll_id, user_id, username, text, created_at")
      .single();

    setIsSubmittingComment(false);

    if (error || !insertedComment) {
      console.error("Error saving poll comment:", error);
      setStatus({ type: "error", text: error?.message ?? "Could not post your comment." });
      return;
    }

    setComments((prev) => [
      {
        ...(insertedComment as PollCommentRecord),
        text: cleanDisplayText(insertedComment.text),
        avatar_url: profileRow?.avatar_url ?? null,
      },
      ...prev,
    ]);
    setPoll((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
    setCommentInput("");
  };

  if (isLoading) {
    return (
      <section className="page-shell article-page-shell">
        <LoadingScreen label="Loading poll" message="Fetching votes, hearts, and comments." />
      </section>
    );
  }

  if (!poll) {
    return (
      <section className="page-shell article-page-shell">
        <div className="empty-state">
          <strong>Poll not found</strong>
          <span>This poll could not be loaded.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell article-page-shell">
      <section className="section-card article-detail-hero stack poll-detail-card">
        <div className="poll-detail-header">
          <div className="poll-detail-creator">
            {poll.creatorAvatarUrl ? (
              <span className="poll-detail-avatar">
                <Image
                  src={poll.creatorAvatarUrl}
                  alt={creatorLabel}
                  width={42}
                  height={42}
                  unoptimized
                />
              </span>
            ) : (
              <span className="poll-card-brand-mark poll-detail-brand-mark" aria-hidden="true">
                ●
              </span>
            )}
            <div className="stack" style={{ gap: "4px" }}>
              <span className="trending-source-name">{creatorLabel}</span>
              <span className="chip chip-accent trending-category-pill trending-category-pill-inline">
                {poll.category}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={`icon-action-pill poll-detail-heart-button ${
              poll.userHasHearted ? "icon-action-pill-active" : ""
            }`}
            onClick={handleToggleHeart}
            disabled={isHeartLoading}
            aria-label={poll.userHasHearted ? "Remove heart" : "Heart poll"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <HeartIcon filled={poll.userHasHearted} size={18} strokeWidth={1.9} />
            </span>
            <span>{poll.heartCount}</span>
          </button>
        </div>

        <h1 className="article-headline">{poll.question}</h1>

        <div className="trending-meta-row poll-detail-meta">
          <span className="trending-published-date">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</span>
          <span>{poll.commentCount} comment{poll.commentCount === 1 ? "" : "s"}</span>
        </div>

        {poll.related_article_title && relatedArticleHref ? (
          <Link href={relatedArticleHref} className="poll-related-article">
            <strong>Related article</strong>
            <span>{poll.related_article_title}</span>
            {poll.related_source ? <span className="muted">{poll.related_source}</span> : null}
          </Link>
        ) : null}

        <PollCard
          poll={poll}
          onVote={handleVote}
          isVoting={isVoting}
          showAuthor={false}
          showHeartAction
          onToggleHeart={handleToggleHeart}
          isHeartLoading={isHeartLoading}
          className="poll-detail-embedded-card"
        />

        {status ? (
          <div
            className={`status-message ${
              status.type === "success" ? "status-success" : "status-error"
            }`}
          >
            {status.text}
          </div>
        ) : null}
      </section>

      <section className="section-card article-comments-inline">
        <div className="article-comments-inline-header">
          <h3 className="article-comments-inline-title">{commentsTitle}</h3>
        </div>

        <div className="article-comments-thread article-comments-inline-thread">
          {comments.length === 0 ? (
            <div className="empty-state">
              <strong>No comments yet</strong>
              <span>Start the conversation on this poll.</span>
            </div>
          ) : (
            <div className="comment-list">
              {comments.map((comment) => (
                <div key={comment.id} className="comment-card">
                  <div className="comment-header">
                    {comment.avatar_url ? (
                      <span className="comment-user-avatar">
                        <Image
                          src={comment.avatar_url}
                          alt={comment.username ?? "User avatar"}
                          width={34}
                          height={34}
                          unoptimized
                        />
                      </span>
                    ) : (
                      <span className="comment-user-avatar">
                        {(comment.username ?? "U").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <strong>{comment.username ?? "Unknown"}</strong>
                  </div>
                  <div className="comment-body">{comment.text}</div>
                  <div className="comment-meta">{formatRelativeTime(comment.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="comment-sheet-composer article-comments-inline-composer">
          <div className="input-row bottom-sheet-input-row">
            <input
              className="input"
              type="text"
              placeholder="Write a comment..."
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
            />
            <button
              className="button button-secondary"
              onClick={handleSubmitComment}
              disabled={isSubmittingComment}
            >
              {isSubmittingComment ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
