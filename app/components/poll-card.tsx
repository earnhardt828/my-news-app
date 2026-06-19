"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCategoryLabel } from "../../lib/categories";
import { formatPollTimestamp, type PollWithResults } from "../../lib/polls";
import HeartIcon from "./heart-icon";

type PollCardProps = {
  poll: PollWithResults;
  onVote?: (pollId: string, optionId: string) => void;
  isVoting?: boolean;
  rankLabel?: string | null;
  showAuthor?: boolean;
  className?: string;
  showHeartAction?: boolean;
  onToggleHeart?: (pollId: string) => void;
  isHeartLoading?: boolean;
  onAuthRequired?: () => void;
  featured?: boolean;
};

export default function PollCard({
  poll,
  onVote,
  isVoting = false,
  rankLabel = null,
  showAuthor = true,
  className = "",
  showHeartAction = false,
  onToggleHeart,
  isHeartLoading = false,
  onAuthRequired,
  featured = false,
}: PollCardProps) {
  const router = useRouter();
  const [hasRenderableImage, setHasRenderableImage] = useState(Boolean(poll.image_url));
  const hasVoted = Boolean(poll.userVoteOptionId);
  const showResults = hasVoted || !onVote;
  const rootClassName = `news-card poll-card ${rankLabel ? "news-card-has-rank" : ""} ${
    featured ? "poll-card-featured-surface" : ""
  } ${className}`.trim();

  useEffect(() => {
    setHasRenderableImage(Boolean(poll.image_url));
  }, [poll.id, poll.image_url]);

  const handleOpenPoll = () => {
    router.push(`/poll/${poll.id}/`);
  };

  const handleVoteAttempt = (optionId: string) => {
    if (!onVote) {
      onAuthRequired?.();
      return;
    }

    onVote(poll.id, optionId);
  };

  return (
    <article
      className={rootClassName}
      role="link"
      tabIndex={0}
      onClick={handleOpenPoll}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenPoll();
        }
      }}
    >
      {hasRenderableImage && poll.image_url ? (
        <div className="poll-card-image-wrap">
          <img
            src={poll.image_url}
            alt={poll.question}
            className="poll-card-image"
            loading="lazy"
            onError={() => setHasRenderableImage(false)}
          />
        </div>
      ) : null}

      <div className="news-card-top-row">
        <div className="trending-source-brand poll-card-brand poll-card-brand-top">
          <span className="poll-card-category-marker" aria-hidden="true" />
          <span className="chip poll-card-inline-category-badge">
            {getCategoryLabel(poll.category)}
          </span>
          {showAuthor ? (
            <>
              <span className="trending-source-category-separator" aria-hidden="true">
                ·
              </span>
              <span className="trending-source-name">
                {poll.username ? `@${poll.username}` : "Graffiti Poll"}
              </span>
            </>
          ) : null}
        </div>
        {rankLabel ? (
          <span className="chip trending-rank-badge news-card-rank-badge">{rankLabel}</span>
        ) : null}
      </div>

      <div className="news-card-body news-card-body-text-only">
        <div className="news-card-copy">
          <h3 className="trending-article-title poll-card-title">{poll.question}</h3>
          {poll.related_article_title ? (
            <p className="poll-card-context">Linked to: {poll.related_article_title}</p>
          ) : null}
          <div className="poll-options-list">
            {poll.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`poll-option-button ${
                  showResults && poll.userVoteOptionId === option.id
                    ? "poll-option-button-active"
                    : ""
                }`}
                disabled={hasVoted || isVoting || (!onVote && !onAuthRequired)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleVoteAttempt(option.id);
                }}
              >
                {showResults ? (
                  <span
                    className="poll-option-bar"
                    aria-hidden="true"
                    style={{ width: `${option.percentage}%` }}
                  />
                ) : null}
                <span className="poll-option-copy">
                  <span>{option.optionText}</span>
                  {showResults ? (
                    <span className="poll-option-percentage">{option.percentage}%</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="trending-meta-row poll-card-meta">
            <span className="trending-published-date">{formatPollTimestamp(poll.created_at)}</span>
            <span>{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</span>
            <span>{poll.heartCount} heart{poll.heartCount === 1 ? "" : "s"}</span>
            <span>{poll.commentCount} comment{poll.commentCount === 1 ? "" : "s"}</span>
            {showHeartAction ? (
              <button
                type="button"
                className={`poll-heart-button ${poll.userHasHearted ? "poll-heart-button-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleHeart?.(poll.id);
                }}
                disabled={isHeartLoading}
                aria-label={poll.userHasHearted ? "Remove heart" : "Heart poll"}
              >
                <HeartIcon filled={poll.userHasHearted} size={18} strokeWidth={1.9} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
