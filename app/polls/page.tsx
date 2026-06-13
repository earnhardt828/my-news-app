"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PollCard from "../components/poll-card";
import {
  applyPollVoteUpdate,
  getPollTrendingScore,
  hydratePolls,
  type PollRecord,
  type PollWithResults,
} from "../../lib/polls";
import { getCategoryLabel } from "../../lib/categories";
import { getStoredPollArticleImage, readPollArticleImageMap } from "../../lib/poll-images";
import { supabase } from "../../lib/supabase";

const ALL_POLLS_FILTER = "all";

function getPollHeroAccent(category: string) {
  switch (category.toLowerCase()) {
    case "politics":
      return "linear-gradient(135deg, rgba(16, 40, 80, 0.88), rgba(33, 73, 130, 0.7))";
    case "business":
      return "linear-gradient(135deg, rgba(29, 51, 42, 0.9), rgba(56, 114, 91, 0.72))";
    case "sports":
      return "linear-gradient(135deg, rgba(69, 24, 24, 0.9), rgba(161, 58, 58, 0.72))";
    case "entertainment":
      return "linear-gradient(135deg, rgba(77, 34, 20, 0.9), rgba(201, 103, 60, 0.72))";
    case "technology":
      return "linear-gradient(135deg, rgba(25, 31, 58, 0.92), rgba(77, 90, 164, 0.74))";
    default:
      return "linear-gradient(135deg, rgba(24, 30, 45, 0.92), rgba(68, 82, 119, 0.72))";
  }
}

export default function PollsPage() {
  const [polls, setPolls] = useState<PollWithResults[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [activeVotePollId, setActiveVotePollId] = useState<string | null>(null);
  const [activeHeartPollId, setActiveHeartPollId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_POLLS_FILTER);
  const [pollImageRefreshKey, setPollImageRefreshKey] = useState(0);

  useEffect(() => {
    setPollImageRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPollsHub() {
      setIsLoading(true);
      setStatus(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      setViewerId(user?.id ?? null);

      const { data, error } = await supabase
        .from("polls")
        .select(
          "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(80);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Error loading Polls hub:", error);
        setPolls([]);
        setStatus(error.message ?? "Could not load polls right now.");
        setIsLoading(false);
        return;
      }

      const hydrated = await hydratePolls(
        supabase,
        ((data ?? []) as PollRecord[]) ?? [],
        user?.id ?? null
      );

      if (!isMounted) {
        return;
      }

      setPolls(hydrated);
      setIsLoading(false);
    }

    void loadPollsHub();

    return () => {
      isMounted = false;
    };
  }, []);

  const pollImageMap = useMemo(() => {
    pollImageRefreshKey;
    return readPollArticleImageMap();
  }, [pollImageRefreshKey]);

  const pollsWithImages = useMemo(
    () =>
      polls.map((poll) => ({
        poll,
        articleImage:
          pollImageMap[`poll:${poll.id}`] ??
          getStoredPollArticleImage(poll) ??
          null,
      })),
    [pollImageMap, polls]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    polls.forEach((poll) => {
      const category = poll.category || "General";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return counts;
  }, [polls]);

  const availableCategories = useMemo(
    () =>
      [ALL_POLLS_FILTER, ...Array.from(categoryCounts.keys()).sort((left, right) => left.localeCompare(right))],
    [categoryCounts]
  );

  const filteredPollEntries = useMemo(
    () =>
      pollsWithImages.filter(({ poll }) =>
        selectedCategory === ALL_POLLS_FILTER ? true : poll.category === selectedCategory
      ),
    [pollsWithImages, selectedCategory]
  );

  const pollOfTheDay = useMemo(
    () =>
      [...filteredPollEntries].sort(
        (left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll)
      )[0] ?? null,
    [filteredPollEntries]
  );

  const linkedStoryPolls = useMemo(
    () =>
      filteredPollEntries
        .filter(({ poll }) => Boolean(poll.related_article_title))
        .sort(
          (left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll)
        )
        .slice(0, 8),
    [filteredPollEntries]
  );

  const newestPolls = useMemo(
    () =>
      [...filteredPollEntries]
        .sort(
          (left, right) =>
            new Date(right.poll.created_at ?? 0).getTime() -
            new Date(left.poll.created_at ?? 0).getTime()
        )
        .slice(0, 18),
    [filteredPollEntries]
  );

  const hotPredictions = useMemo(
    () =>
      [...filteredPollEntries]
        .sort(
          (left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll)
        )
        .slice(0, 10),
    [filteredPollEntries]
  );

  const handleVote = async (pollId: string, optionId: string) => {
    if (!viewerId) {
      setStatus("Log in to vote in polls.");
      return;
    }

    const targetPoll = polls.find((poll) => poll.id === pollId);
    if (!targetPoll || targetPoll.userVoteOptionId) {
      return;
    }

    setActiveVotePollId(pollId);
    setStatus(null);

    const { error } = await supabase.from("poll_votes").insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: viewerId,
    });

    setActiveVotePollId(null);

    if (error) {
      console.error("Error saving poll vote:", error);
      setStatus(error.message ?? "Could not save your vote.");
      return;
    }

    setPolls((prev) => applyPollVoteUpdate(prev, pollId, optionId));
  };

  const handleToggleHeart = async (pollId: string) => {
    if (!viewerId) {
      setStatus("Log in to like polls.");
      return;
    }

    const targetPoll = polls.find((poll) => poll.id === pollId);
    if (!targetPoll) {
      return;
    }

    setActiveHeartPollId(pollId);
    setStatus(null);

    if (targetPoll.userHasHearted) {
      const { error } = await supabase
        .from("poll_hearts")
        .delete()
        .eq("poll_id", pollId)
        .eq("user_id", viewerId);

      setActiveHeartPollId(null);

      if (error) {
        console.error("Error removing poll heart:", error);
        setStatus(error.message ?? "Could not remove your like.");
        return;
      }

      setPolls((prev) =>
        prev.map((poll) =>
          poll.id === pollId
            ? {
                ...poll,
                userHasHearted: false,
                heartCount: Math.max(0, poll.heartCount - 1),
              }
            : poll
        )
      );
      return;
    }

    const { error } = await supabase.from("poll_hearts").insert({
      poll_id: pollId,
      user_id: viewerId,
    });

    setActiveHeartPollId(null);

    if (error) {
      console.error("Error saving poll heart:", error);
      setStatus(error.message ?? "Could not like this poll.");
      return;
    }

    setPolls((prev) =>
      prev.map((poll) =>
        poll.id === pollId
          ? { ...poll, userHasHearted: true, heartCount: poll.heartCount + 1 }
          : poll
      )
    );
  };

  return (
    <section className="page-shell home-sections-shell polls-hub-shell">
      {isLoading ? (
        <div className="loading-state">
          <span className="loading-screen-spinner" aria-hidden="true" />
          <strong>Loading polls...</strong>
          <span>Gathering the latest community picks and predictions.</span>
        </div>
      ) : null}

      {status ? <div className="muted">{status}</div> : null}

      {!isLoading && pollOfTheDay ? (
        <section
          className="poll-hub-hero"
          style={{
            backgroundImage: pollOfTheDay.articleImage
              ? `${getPollHeroAccent(pollOfTheDay.poll.category)}, url(${pollOfTheDay.articleImage})`
              : getPollHeroAccent(pollOfTheDay.poll.category),
          }}
        >
          <div className="poll-hub-hero-overlay">
            <span className="chip chip-accent">Poll of the Day</span>
            <strong className="poll-hub-hero-title">{pollOfTheDay.poll.question}</strong>
            <div className="poll-hub-hero-meta">
              <span>{getCategoryLabel(pollOfTheDay.poll.category)}</span>
              <span>{pollOfTheDay.poll.totalVotes} votes</span>
              <span>{pollOfTheDay.poll.commentCount} comments</span>
            </div>
            {pollOfTheDay.poll.related_article_title ? (
              <span className="poll-hub-hero-context">
                Linked to: {pollOfTheDay.poll.related_article_title}
              </span>
            ) : null}
            <Link href={`/poll/${pollOfTheDay.poll.id}/`} className="button">
              Open Poll
            </Link>
          </div>
        </section>
      ) : null}

      {!isLoading ? (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Poll Categories</strong>
            </div>
          </div>
          <div className="poll-hub-category-row">
            {availableCategories.map((category) => {
              const isActive = selectedCategory === category;
              const count =
                category === ALL_POLLS_FILTER
                  ? polls.length
                  : (categoryCounts.get(category) ?? 0);

              return (
                <button
                  key={category}
                  type="button"
                  className={`toolbar-pill ${isActive ? "toolbar-pill-active" : ""}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category === ALL_POLLS_FILTER ? "All Polls" : getCategoryLabel(category)} ({count})
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!isLoading && linkedStoryPolls.length > 0 ? (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Linked to Stories</strong>
              <span className="muted">News-focused polls tied to active reporting and live debates.</span>
            </div>
          </div>
          <div className="polls-carousel" role="list" aria-label="Linked story polls">
            {linkedStoryPolls.map(({ poll }) => (
              <div key={poll.id} className="polls-carousel-item" role="listitem">
                <PollCard
                  poll={poll}
                  onVote={handleVote}
                  isVoting={activeVotePollId === poll.id}
                  showHeartAction
                  onToggleHeart={handleToggleHeart}
                  isHeartLoading={activeHeartPollId === poll.id}
                  onAuthRequired={() => setStatus("Log in to vote in polls.")}
                  className="poll-card-featured"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && hotPredictions.length > 0 ? (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Hot Predictions</strong>
              <span className="muted">The polls getting the strongest mix of votes, likes, and conversation.</span>
            </div>
          </div>
          <div className="stack home-section-list">
            {hotPredictions.slice(0, 3).map(({ poll }, index) => (
              <PollCard
                key={poll.id}
                poll={poll}
                rankLabel={`#${index + 1}`}
                onVote={handleVote}
                isVoting={activeVotePollId === poll.id}
                showHeartAction
                onToggleHeart={handleToggleHeart}
                isHeartLoading={activeHeartPollId === poll.id}
                onAuthRequired={() => setStatus("Log in to vote in polls.")}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && newestPolls.length > 0 ? (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Latest Polls</strong>
              <span className="muted">Fast-moving community takes across news, policy, business, sports, and culture.</span>
            </div>
            <Link href="/profile/polls/new/" className="button button-secondary">
              Create Poll
            </Link>
          </div>
          <div className="stack home-section-list">
            {newestPolls.map(({ poll }) => (
              <PollCard
                key={poll.id}
                poll={poll}
                onVote={handleVote}
                isVoting={activeVotePollId === poll.id}
                showHeartAction
                onToggleHeart={handleToggleHeart}
                isHeartLoading={activeHeartPollId === poll.id}
                onAuthRequired={() => setStatus("Log in to vote in polls.")}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && polls.length === 0 ? (
        <div className="empty-state compact-empty-state">
          <strong>No polls yet</strong>
          <span>Polls will show up here as soon as the Graffiti community starts posting them.</span>
        </div>
      ) : null}
    </section>
  );
}
