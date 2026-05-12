"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCategoryLabel } from "../../lib/categories";
import { formatPollTimestamp, type PollWithResults } from "../../lib/polls";

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
}: PollCardProps) {
  const router = useRouter();
  const hasVoted = Boolean(poll.userVoteOptionId);
  const showResults = hasVoted || !onVote;
  const rootClassName = `news-card poll-card ${rankLabel ? "news-card-has-rank" : ""} ${className}`.trim();
  const handleOpenPoll = () => {
    router.push(`/poll/${poll.id}`);
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
      <div className="news-card-top-row">
        <span className="chip chip-accent trending-category-pill trending-category-pill-inline">
          {getCategoryLabel(poll.category)}
        </span>
        {rankLabel ? (
          <span className="chip trending-rank-badge news-card-rank-badge">{rankLabel}</span>
        ) : null}
      </div>

      <div className="trending-source-row">
        <div className="trending-source-brand poll-card-brand">
          {poll.creatorAvatarUrl ? (
            <span className="poll-card-avatar" aria-hidden="true">
              <Image
                src={poll.creatorAvatarUrl}
                alt=""
                width={22}
                height={22}
                unoptimized
              />
            </span>
          ) : (
            <span className="poll-card-brand-mark" aria-hidden="true">
              ●
            </span>
          )}
          <span className="trending-source-name">
            {showAuthor && poll.username ? `@${poll.username}` : "Graffiti Poll"}
          </span>
        </div>
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
                disabled={hasVoted || isVoting || !onVote}
                onClick={(event) => {
                  event.stopPropagation();
                  onVote?.(poll.id, option.id);
                }}
              >
                <span className="poll-option-copy">
                  <span>{option.optionText}</span>
                  {showResults ? (
                    <span className="poll-option-percentage">{option.percentage}%</span>
                  ) : null}
                </span>
                {showResults ? (
                  <span
                    className="poll-option-bar"
                    aria-hidden="true"
                    style={{ width: `${option.percentage}%` }}
                  />
                ) : null}
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
                ♥
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
