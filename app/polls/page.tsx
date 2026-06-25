"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PollCard from "../components/poll-card";
import {
  applyPollVoteUpdate,
  getPollReportsSetupMessage,
  getPollTrendingScore,
  hydratePolls,
  isPollReportsSchemaMissingError,
  POLL_HIDDEN_REPORT_THRESHOLD,
  POLL_PUBLIC_STATUSES,
  POLL_SELECT_BASE,
  POLL_SELECT_WITH_IMAGE,
  withPollImageColumnFallback,
  type PollRecord,
  type PollWithResults,
} from "../../lib/polls";
import { supabase } from "../../lib/supabase";

const POLL_SECTION_ORDER = [
  "Politics",
  "World",
  "Sports",
  "Movies",
  "Business",
  "Technology",
  "Local",
] as const;

const POLL_FILTER_TABS = [
  "All Polls",
  "Following",
  ...POLL_SECTION_ORDER,
] as const;

type PollSectionName = (typeof POLL_SECTION_ORDER)[number];
type PollFilterTab = (typeof POLL_FILTER_TABS)[number];

type PollEntry = {
  poll: PollWithResults;
  sectionCategory: PollSectionName | null;
};

function getNormalizedPollSection(poll: PollWithResults): PollSectionName | null {
  const haystack = `${poll.category ?? ""} ${poll.question ?? ""} ${poll.related_article_title ?? ""} ${poll.related_source ?? ""}`.toLowerCase();

  if (/\b(local|city hall|county|school board|mayor|neighborhood|statehouse|state legislature)\b/.test(haystack)) {
    return "Local";
  }

  if (/\b(movie|movies|film|box office|hollywood|streaming|series finale|season premiere|oscar|emmy)\b/.test(haystack)) {
    return "Movies";
  }

  if (/\b(tech|technology|ai|software|app|cyber|apple|google|microsoft|chip|startup|robot)\b/.test(haystack)) {
    return "Technology";
  }

  if (/\b(sport|sports|game|playoff|final|match|team|player|mlb|nba|nfl|nhl|wnba|soccer|golf)\b/.test(haystack)) {
    return "Sports";
  }

  if (/\b(business|market|stock|economy|earnings|company|tariff|trade|inflation|wall street|finance)\b/.test(haystack)) {
    return "Business";
  }

  if (/\b(world|international|foreign|europe|asia|africa|latin america|middle east|ukraine|russia|china|israel|gaza|iran|nato|un)\b/.test(haystack)) {
    return "World";
  }

  if (/\b(politic|election|congress|senate|house|white house|president|campaign|democrat|republican|governor|policy)\b/.test(haystack)) {
    return "Politics";
  }

  return null;
}

function buildSectionEntries(entries: PollEntry[]) {
  const sections = new Map<PollSectionName, PollEntry[]>();
  POLL_SECTION_ORDER.forEach((name) => sections.set(name, []));

  entries.forEach((entry) => {
    if (entry.sectionCategory) {
      sections.get(entry.sectionCategory)?.push(entry);
    }
  });

  return POLL_SECTION_ORDER.map((name) => ({
    key: name.toLowerCase(),
    title: name,
    entries: [...(sections.get(name) ?? [])]
      .sort((left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll))
      .slice(0, 10),
  })).filter((section) => section.entries.length > 0);
}

export default function PollsPage() {
  const [polls, setPolls] = useState<PollWithResults[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<PollFilterTab>("All Polls");
  const [activeVotePollId, setActiveVotePollId] = useState<string | null>(null);
  const [activeHeartPollId, setActiveHeartPollId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

      if (user?.id) {
        const { data: followRowsData, error: followRowsError } = await supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", user.id);

        if (!isMounted) {
          return;
        }

        if (followRowsError) {
          console.error("Error loading followed users for polls:", followRowsError);
          setFollowingIds([]);
        } else {
          setFollowingIds(
            (((followRowsData ?? []) as { following_id: string | null }[]) ?? [])
              .map((row) => row.following_id)
              .filter((value): value is string => Boolean(value))
          );
        }
      } else {
        setFollowingIds([]);
      }

      const { data, error } = await withPollImageColumnFallback(
        () =>
          supabase
            .from("polls")
            .select(POLL_SELECT_WITH_IMAGE)
            .in("status", [...POLL_PUBLIC_STATUSES])
            .order("created_at", { ascending: false })
            .limit(80),
        () =>
          supabase
            .from("polls")
            .select(POLL_SELECT_BASE)
            .in("status", [...POLL_PUBLIC_STATUSES])
            .order("created_at", { ascending: false })
            .limit(80)
      );

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

      const pollIds = hydrated.map((poll) => poll.id);
      let hiddenPollIds = new Set<string>();

      if (pollIds.length > 0) {
        const { data: reportRows, error: reportsError } = await supabase
          .from("poll_reports")
          .select("poll_id")
          .in("poll_id", pollIds);

        if (reportsError && !isPollReportsSchemaMissingError(reportsError.message)) {
          console.error("Error loading poll reports:", reportsError);
        } else if (reportsError && isPollReportsSchemaMissingError(reportsError.message)) {
          console.warn(getPollReportsSetupMessage());
        } else {
          const reportCounts = (((reportRows ?? []) as { poll_id: string }[]) ?? []).reduce(
            (map, report) => {
              map.set(report.poll_id, (map.get(report.poll_id) ?? 0) + 1);
              return map;
            },
            new Map<string, number>()
          );

          hiddenPollIds = new Set(
            Array.from(reportCounts.entries())
              .filter(([, count]) => count >= POLL_HIDDEN_REPORT_THRESHOLD)
              .map(([pollId]) => pollId)
          );
        }
      }

      if (!isMounted) {
        return;
      }

      setPolls(hydrated.filter((poll) => !hiddenPollIds.has(poll.id)));
      setIsLoading(false);
    }

    void loadPollsHub();

    return () => {
      isMounted = false;
    };
  }, []);

  const pollEntries = useMemo<PollEntry[]>(
    () =>
      polls.map((poll) => ({
        poll,
        sectionCategory: getNormalizedPollSection(poll),
      })),
    [polls]
  );

  const mostPopularEntries = useMemo(
    () =>
      [...pollEntries]
        .sort((left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll))
        .slice(0, 5),
    [pollEntries]
  );

  const allSections = useMemo(() => buildSectionEntries(pollEntries), [pollEntries]);

  const followingEntries = useMemo(
    () =>
      pollEntries
        .filter(({ poll }) => followingIds.includes(poll.user_id))
        .sort((left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll)),
    [pollEntries, followingIds]
  );

  const activeCategoryEntries = useMemo(() => {
    if (activeFilter === "All Polls" || activeFilter === "Following") {
      return [] as PollEntry[];
    }

    return pollEntries
      .filter((entry) => entry.sectionCategory === activeFilter)
      .sort((left, right) => getPollTrendingScore(right.poll) - getPollTrendingScore(left.poll));
  }, [activeFilter, pollEntries]);

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
      <div className="polls-page-topbar">
        <strong className="profile-section-title home-section-title">Polls</strong>
        <Link
          href="/profile/polls/new/"
          className="button button-accent polls-create-button"
          aria-label="Create poll"
        >
          <span aria-hidden="true">+</span>
        </Link>
      </div>

      <div className="polls-filter-tabs" role="tablist" aria-label="Poll filters">
        {POLL_FILTER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeFilter === tab}
            className={`polls-filter-tab ${activeFilter === tab ? "polls-filter-tab-active" : ""}`}
            onClick={() => setActiveFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="loading-state">
          <span className="loading-screen-spinner" aria-hidden="true" />
          <strong>Loading polls...</strong>
          <span>Pulling together the latest community voting.</span>
        </div>
      ) : null}

      {status ? <div className="muted">{status}</div> : null}

      {!isLoading && activeFilter === "All Polls" ? (
        <>
          {mostPopularEntries.length > 0 ? (
            <section className="home-section-block home-section-plain poll-section-block">
              <div className="home-section-header">
                <strong className="profile-section-title home-section-title">Most Popular Polls</strong>
                <Link href="/profile/polls/new/" className="button button-secondary">
                  Create Poll
                </Link>
              </div>
              <div className="polls-card-stack" role="list" aria-label="Most popular polls">
                {mostPopularEntries.map(({ poll }, index) => (
                  <div key={poll.id} className="polls-card-stack-item" role="listitem">
                    <PollCard
                      poll={poll}
                      onVote={handleVote}
                      isVoting={activeVotePollId === poll.id}
                      showHeartAction
                      onToggleHeart={handleToggleHeart}
                      isHeartLoading={activeHeartPollId === poll.id}
                      onAuthRequired={() => setStatus("Log in to vote in polls.")}
                      rankLabel={`${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {allSections.map((section) => (
            <section key={section.key} className="home-section-block home-section-plain poll-section-block">
              <div className="home-section-header">
                <strong className="profile-section-title home-section-title">{section.title}</strong>
              </div>
              <div className="polls-carousel" role="list" aria-label={`${section.title} polls`}>
                {section.entries.map(({ poll }) => (
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
          ))}
        </>
      ) : null}

      {!isLoading && activeFilter === "Following" ? (
        <section className="home-section-block home-section-plain poll-section-block">
          <div className="home-section-header">
            <strong className="profile-section-title home-section-title">Following</strong>
          </div>
          {!viewerId ? (
            <div className="empty-state compact-empty-state">
              <strong>Log in to see followed polls</strong>
              <span>Polls from the people you follow will show up here.</span>
            </div>
          ) : followingIds.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>You are not following anyone yet</strong>
              <span>Follow users from their public profiles to build this tab.</span>
            </div>
          ) : followingEntries.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No followed polls yet</strong>
              <span>The people you follow have not posted any live polls yet.</span>
            </div>
          ) : (
            <div className="polls-card-stack" role="list" aria-label="Followed polls">
              {followingEntries.map(({ poll }) => (
                <div key={poll.id} className="polls-card-stack-item" role="listitem">
                  <PollCard
                    poll={poll}
                    onVote={handleVote}
                    isVoting={activeVotePollId === poll.id}
                    showHeartAction
                    onToggleHeart={handleToggleHeart}
                    isHeartLoading={activeHeartPollId === poll.id}
                    onAuthRequired={() => setStatus("Log in to vote in polls.")}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!isLoading && activeFilter !== "All Polls" && activeFilter !== "Following" ? (
        <section className="home-section-block home-section-plain poll-section-block">
          <div className="home-section-header">
            <strong className="profile-section-title home-section-title">{activeFilter}</strong>
          </div>
          {activeCategoryEntries.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No {activeFilter.toLowerCase()} polls yet</strong>
              <span>New community polls in this category will show up here.</span>
            </div>
          ) : (
            <div className="polls-card-stack" role="list" aria-label={`${activeFilter} polls`}>
              {activeCategoryEntries.map(({ poll }) => (
                <div key={poll.id} className="polls-card-stack-item" role="listitem">
                  <PollCard
                    poll={poll}
                    onVote={handleVote}
                    isVoting={activeVotePollId === poll.id}
                    showHeartAction
                    onToggleHeart={handleToggleHeart}
                    isHeartLoading={activeHeartPollId === poll.id}
                    onAuthRequired={() => setStatus("Log in to vote in polls.")}
                  />
                </div>
              ))}
            </div>
          )}
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
