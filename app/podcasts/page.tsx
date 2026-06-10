"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CommentIcon from "../components/comment-icon";
import HeartIcon from "../components/heart-icon";
import { apiFetch } from "../../lib/api-base";
import {
  buildStaticFallbackPodcastDirectory,
  PODCAST_INDEX_BACKGROUND_ONLY,
  type PodcastDirectory,
  type PodcastEpisode as DirectoryPodcastEpisode,
  type PodcastShow,
} from "../../lib/podcasts";
import { formatRelativeTimestamp } from "../../lib/relative-time";

type PodcastClip = {
  show: PodcastShow;
  episode: DirectoryPodcastEpisode;
};

type PodcastInteractionState = {
  liked: boolean;
  likes: number;
  comments: number;
  saved: boolean;
  shares: number;
};

type ContinueListeningEntry = {
  showSlug: string;
  episodeSlug: string;
  progress: number;
  updatedAt: number;
};

const PODCAST_INTERACTIONS_STORAGE_KEY = "graffiti-podcast-interactions";
const PODCAST_PROGRESS_STORAGE_KEY = "graffiti-podcast-progress";

function normalizePodcastArtworkUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }

  return trimmed;
}

function buildLocalPodcastCoverCandidates(slug: string) {
  return [
    `/podcast-covers/${slug}.png`,
    `/podcast-covers/${slug}.jpg`,
    `/podcast-covers/${slug}.webp`,
  ];
}

function getPodcastCardImageCandidates(show: PodcastShow) {
  const unique = new Set<string>();
  const candidates = [
    ...buildLocalPodcastCoverCandidates(show.slug),
    show.artworkUrl600,
    show.artworkUrl100,
    show.image,
    show.artwork,
    show.podcastImage,
    show.feedImage,
    show.itunesImage,
    show.coverArt,
  ]
    .map((value) => normalizePodcastArtworkUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (unique.has(value)) {
        return false;
      }
      unique.add(value);
      return true;
    });

  return candidates;
}

function getPodcastCardDescription(show: PodcastShow) {
  return (
    show.description ||
    show.summary ||
    show.artistName ||
    show.publisher ||
    "Latest episodes and updates from this podcast."
  );
}

function normalizePodcastSearchText(...values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scorePodcastMomentum(show: PodcastShow) {
  const latestTimestamp = show.latestEpisode?.publishedAt
    ? new Date(show.latestEpisode.publishedAt).getTime()
    : 0;
  const recencyBoost = latestTimestamp
    ? Math.max(0, 100 - Math.floor((Date.now() - latestTimestamp) / 86_400_000))
    : 0;
  const featuredBoost = show.featured ? 80 : 0;
  return recencyBoost + Math.min(show.episodeCount, 120) + featuredBoost;
}

function looksLikeComedyPodcast(show: PodcastShow) {
  return /\b(comedy|comedian|funny|laugh|satire|improv|late night|standup|stand-up|humor)\b/i.test(
    normalizePodcastSearchText(
      show.title,
      show.publisher,
      show.description,
      show.summary,
      show.artistName
    )
  );
}

function getPodcastEpisodeKey(showSlug: string, episodeSlug: string) {
  return `${showSlug}:${episodeSlug}`;
}

function clampPodcastProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function PodcastSectionRow({
  title,
  shows,
}: {
  title: string;
  shows: PodcastShow[];
}) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  if (shows.length === 0) {
    return null;
  }

  return (
    <section className="home-section-block home-section-plain">
      <div className="home-section-header">
        <div className="stack" style={{ gap: "4px" }}>
          <strong className="profile-section-title home-section-title">{title}</strong>
        </div>
      </div>

      <div className="podcast-scroll-row" role="list" aria-label={title}>
        {shows.map((show) => {
          const latestEpisode = show.latestEpisode;
          const imageCandidates = getPodcastCardImageCandidates(show);
          const imageUrl =
            imageCandidates.find((candidate) => !failedImages[`${show.slug}:${candidate}`]) ?? null;
          const imageKey = `${show.slug}:${imageUrl ?? "none"}`;
          const showImage = Boolean(imageUrl);

          if (showImage && imageUrl) {
            console.log("PODCAST CARD IMAGE_USED", {
              slug: show.slug,
              imageUrl,
            });
            if (imageUrl.startsWith("/podcast-covers/")) {
              console.log("PODCAST_LOCAL_COVER_USED", {
                slug: show.slug,
                imageUrl,
              });
            } else {
              console.log("PODCAST_REMOTE_COVER_USED", {
                slug: show.slug,
                imageUrl,
              });
            }
          } else {
            console.log("PODCAST CARD IMAGE_MISSING", {
              slug: show.slug,
              imageUrl,
            });
            console.log("PODCAST_COVER_MISSING", {
              slug: show.slug,
            });
          }

          const cardContent = (
            <>
              <div className="podcast-card-art-shell" aria-hidden="true">
                {showImage && imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={show.title}
                    className="podcast-card-art"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      setFailedImages((prev) => {
                        if (prev[imageKey]) {
                          return prev;
                        }

                        return {
                          ...prev,
                          [imageKey]: true,
                        };
                      });
                    }}
                  />
                ) : (
                  <div className="podcast-card-art podcast-card-art-fallback">
                    <span>{show.title.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="podcast-card-copy">
                <strong className="podcast-card-title">{show.title}</strong>
                <span className="podcast-card-publisher">{show.publisher}</span>
                <p className="podcast-card-episode-title">
                  {getPodcastCardDescription(show)}
                </p>
                <span className="podcast-card-date">
                  {latestEpisode?.publishedAt
                    ? formatRelativeTimestamp(latestEpisode.publishedAt)
                    : `${show.episodeCount || "Recent"} episodes`}
                </span>
              </div>
            </>
          );

          const clickTarget = `/podcasts/${show.slug}/`;
          console.log("PODCAST CARD CLICK_TARGET", {
            slug: show.slug,
            href: clickTarget,
          });

          return (
            <Link
              key={`${title}-${show.slug}`}
              href={clickTarget}
              className="podcast-card"
              role="listitem"
              onClick={() => {
                console.log("PODCAST CARD CLICKED", {
                  slug: show.slug,
                  href: clickTarget,
                });
              }}
            >
              {cardContent}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function PodcastsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [directory, setDirectory] = useState<PodcastDirectory>(
    buildStaticFallbackPodcastDirectory()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedClipImages, setFailedClipImages] = useState<Record<string, boolean>>({});
  const [podcastInteractions, setPodcastInteractions] = useState<Record<string, PodcastInteractionState>>({});
  const [continueListening, setContinueListening] = useState<Record<string, ContinueListeningEntry>>({});
  const [discoverSeed, setDiscoverSeed] = useState(0);

  useEffect(() => {
    console.log("PODCASTS PAGE INITIAL_RENDER", {
      fallbackCount: directory.shows.length,
      podcastIndexBackgroundOnly: PODCAST_INDEX_BACKGROUND_ONLY,
    });
    console.log("PODCAST_COVERS_SYNCED", true);
  }, []);

  useEffect(() => {
    try {
      const storedInteractions = window.localStorage.getItem(PODCAST_INTERACTIONS_STORAGE_KEY);
      const storedProgress = window.localStorage.getItem(PODCAST_PROGRESS_STORAGE_KEY);

      if (storedInteractions) {
        setPodcastInteractions(JSON.parse(storedInteractions) as Record<string, PodcastInteractionState>);
      }

      if (storedProgress) {
        setContinueListening(JSON.parse(storedProgress) as Record<string, ContinueListeningEntry>);
      }
    } catch (error) {
      console.error("PODCAST LOCAL STATE LOAD FAILED", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PODCAST_INTERACTIONS_STORAGE_KEY,
        JSON.stringify(podcastInteractions)
      );
    } catch (error) {
      console.error("PODCAST LOCAL STATE SAVE FAILED", error);
    }
  }, [podcastInteractions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PODCAST_PROGRESS_STORAGE_KEY, JSON.stringify(continueListening));
    } catch (error) {
      console.error("PODCAST PROGRESS SAVE FAILED", error);
    }
  }, [continueListening]);

  useEffect(() => {
    let isMounted = true;

    async function loadPodcasts() {
      const filteredFallbackDirectory = buildStaticFallbackPodcastDirectory(searchQuery.trim() || undefined);
      const baseDirectory =
        filteredFallbackDirectory.shows.length > 0
          ? filteredFallbackDirectory
          : buildStaticFallbackPodcastDirectory();
      if (isMounted) {
        setDirectory(baseDirectory);
        if (baseDirectory.shows.length > 0) {
          console.log("PODCAST EMPTY_STATE_BLOCKED", {
            searchQuery,
            count: baseDirectory.shows.length,
          });
        }
      }

      setIsLoading(true);
      if (isMounted) {
        setLoadError(null);
      }

      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
          params.set("q", searchQuery.trim());
        }

        const response = await apiFetch(`/api/podcasts${params.toString() ? `?${params.toString()}` : ""}`);
        const payload = (await response.json()) as PodcastDirectory;

        if (!isMounted) {
          return;
        }

        if (payload.shows.length > 0) {
          setDirectory(payload);
        } else {
          setDirectory(baseDirectory);
          console.log("PODCAST EMPTY_STATE_BLOCKED", {
            searchQuery,
            count: baseDirectory.shows.length,
          });
        }
      } catch (error) {
        console.error("PODCAST DIRECTORY LOAD FAILED", error);

        if (isMounted) {
          setDirectory(baseDirectory);
          setLoadError("Could not refresh podcasts right now. Showing the latest available picks.");
          console.log("PODCAST EMPTY_STATE_BLOCKED", {
            searchQuery,
            count: baseDirectory.shows.length,
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPodcasts();

    return () => {
      isMounted = false;
    };
  }, [searchQuery]);

  const allShows = useMemo(() => directory?.shows ?? [], [directory]);

  const trendingPodcastClips = useMemo(() => {
    return allShows
      .filter((show) => Boolean(show.latestEpisode?.audioUrl))
      .sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left))
      .slice(0, 6)
      .map((show) => ({
        show,
        episode: show.latestEpisode!,
      }));
  }, [allShows]);

  const topNewsPodcasts = useMemo(
    () =>
      allShows
        .filter((show) => show.category === "Politics" || show.featured)
        .sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left))
        .slice(0, 5),
    [allShows]
  );

  const topSportsPodcasts = useMemo(
    () =>
      allShows
        .filter((show) => show.category === "Sports")
        .sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left))
        .slice(0, 5),
    [allShows]
  );

  const topBusinessPodcasts = useMemo(
    () =>
      allShows
        .filter((show) => show.category === "Business")
        .sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left))
        .slice(0, 5),
    [allShows]
  );

  const topComedyPodcasts = useMemo(
    () =>
      allShows
        .filter((show) => looksLikeComedyPodcast(show))
        .sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left))
        .slice(0, 5),
    [allShows]
  );

  const continueListeningItems = useMemo(() => {
    const keyedShows = new Map(allShows.map((show) => [show.slug, show]));

    return Object.values(continueListening)
      .map((entry) => {
        const show = keyedShows.get(entry.showSlug);
        const episode = show?.episodes.find((candidate) => candidate.slug === entry.episodeSlug) ?? show?.latestEpisode ?? null;

        if (!show || !episode) {
          return null;
        }

        return {
          show,
          episode,
          progress: clampPodcastProgress(entry.progress),
          updatedAt: entry.updatedAt,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 6);
  }, [allShows, continueListening]);

  const pulseMostDiscussed = useMemo(
    () =>
      [...allShows]
        .sort((left, right) => {
          const leftKey = getPodcastEpisodeKey(left.slug, left.latestEpisode?.slug ?? left.slug);
          const rightKey = getPodcastEpisodeKey(right.slug, right.latestEpisode?.slug ?? right.slug);
          return (podcastInteractions[rightKey]?.comments ?? 0) - (podcastInteractions[leftKey]?.comments ?? 0);
        })
        .slice(0, 4),
    [allShows, podcastInteractions]
  );

  const pulseFastestGrowing = useMemo(
    () => [...allShows].sort((left, right) => scorePodcastMomentum(right) - scorePodcastMomentum(left)).slice(0, 4),
    [allShows]
  );

  const pulseMostShared = useMemo(
    () =>
      [...allShows]
        .sort((left, right) => {
          const leftKey = getPodcastEpisodeKey(left.slug, left.latestEpisode?.slug ?? left.slug);
          const rightKey = getPodcastEpisodeKey(right.slug, right.latestEpisode?.slug ?? right.slug);
          return (podcastInteractions[rightKey]?.shares ?? 0) - (podcastInteractions[leftKey]?.shares ?? 0);
        })
        .slice(0, 4),
    [allShows, podcastInteractions]
  );

  const discoverShow = useMemo(() => {
    if (allShows.length === 0) {
      return null;
    }

    const index = Math.abs(discoverSeed) % allShows.length;
    return allShows[index] ?? null;
  }, [allShows, discoverSeed]);

  const handleTogglePodcastLike = (show: PodcastShow, episode: DirectoryPodcastEpisode | null) => {
    const key = getPodcastEpisodeKey(show.slug, episode?.slug ?? show.slug);
    setPodcastInteractions((prev) => {
      const current = prev[key] ?? {
        liked: false,
        likes: Math.max(12, Math.min(340, show.episodeCount + 24)),
        comments: Math.max(3, Math.min(80, Math.round(show.episodeCount / 3))),
        saved: false,
        shares: Math.max(1, Math.round(show.episodeCount / 5)),
      };
      const liked = !current.liked;
      return {
        ...prev,
        [key]: {
          ...current,
          liked,
          likes: Math.max(0, current.likes + (liked ? 1 : -1)),
        },
      };
    });
  };

  const handleTogglePodcastSave = (show: PodcastShow, episode: DirectoryPodcastEpisode | null) => {
    const key = getPodcastEpisodeKey(show.slug, episode?.slug ?? show.slug);
    setPodcastInteractions((prev) => {
      const current = prev[key] ?? {
        liked: false,
        likes: Math.max(12, Math.min(340, show.episodeCount + 24)),
        comments: Math.max(3, Math.min(80, Math.round(show.episodeCount / 3))),
        saved: false,
        shares: Math.max(1, Math.round(show.episodeCount / 5)),
      };
      return {
        ...prev,
        [key]: {
          ...current,
          saved: !current.saved,
        },
      };
    });
  };

  const handleOpenPodcastEpisode = (show: PodcastShow, episode: DirectoryPodcastEpisode | null) => {
    if (!episode) {
      return;
    }

    const key = getPodcastEpisodeKey(show.slug, episode.slug);
    setContinueListening((prev) => ({
      ...prev,
      [key]: {
        showSlug: show.slug,
        episodeSlug: episode.slug,
        progress: prev[key]?.progress ? clampPodcastProgress(prev[key].progress + 0.08) : 0.18,
        updatedAt: Date.now(),
      },
    }));
  };

  const renderPodcastInteractionRow = (show: PodcastShow, episode: DirectoryPodcastEpisode | null) => {
    const key = getPodcastEpisodeKey(show.slug, episode?.slug ?? show.slug);
    const state = podcastInteractions[key] ?? {
      liked: false,
      likes: Math.max(12, Math.min(340, show.episodeCount + 24)),
      comments: Math.max(3, Math.min(80, Math.round(show.episodeCount / 3))),
      saved: false,
      shares: Math.max(1, Math.round(show.episodeCount / 5)),
    };

    return (
      <div className="podcast-meta-actions">
        <button
          type="button"
          className={`icon-action-pill ${state.liked ? "icon-action-pill-active" : ""}`}
          onClick={() => handleTogglePodcastLike(show, episode)}
          aria-label={state.liked ? "Unlike episode" : "Like episode"}
        >
          <HeartIcon size={18} strokeWidth={1.9} filled={state.liked} />
          <span>{state.likes}</span>
        </button>
        <button
          type="button"
          className="icon-action-pill"
          aria-label="Episode comments"
        >
          <CommentIcon size={18} strokeWidth={1.9} />
          <span>{state.comments}</span>
        </button>
        <button
          type="button"
          className={`icon-action-pill ${state.saved ? "icon-action-pill-active" : ""}`}
          onClick={() => handleTogglePodcastSave(show, episode)}
          aria-label={state.saved ? "Remove saved episode" : "Save episode"}
        >
          <span aria-hidden="true">{state.saved ? "🔖" : "📑"}</span>
          <span>{state.saved ? "Saved" : "Save"}</span>
        </button>
      </div>
    );
  };

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Podcasts</strong>
          </div>
        </div>

        <div className="stack" style={{ gap: "10px", marginBottom: "16px" }}>
          <input
            type="search"
            className="input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search podcasts by title, publisher, or category"
            aria-label="Search podcasts"
          />
          {searchQuery.trim() ? (
            <span className="muted">Searching across RSS, iTunes, Apple, and available podcast APIs.</span>
          ) : null}
        </div>

        {isLoading ? <div className="muted">Refreshing podcasts...</div> : null}
        {loadError ? <div className="muted">{loadError}</div> : null}

        {!directory || directory.shows.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <strong>No podcasts available right now.</strong>
            <span>Check back shortly while the podcast feeds refresh.</span>
          </div>
        ) : (
          <div className="stack home-section-list">
            {trendingPodcastClips.length > 0 ? (
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Trending Podcast Clips</strong>
                    <span className="muted">Quick highlights from the shows people are opening first.</span>
                  </div>
                </div>
                <div className="podcast-clip-scroll" role="list" aria-label="Trending podcast clips">
                  {trendingPodcastClips.map(({ show, episode }) => {
                    const imageCandidates = getPodcastCardImageCandidates(show);
                    const imageUrl =
                      imageCandidates.find(
                        (candidate) => !failedClipImages[`${show.slug}:${candidate}`]
                      ) ?? null;
                    const imageKey = `${show.slug}:${imageUrl ?? "none"}`;

                    return (
                      <article key={`clip-${show.slug}-${episode.slug}`} className="podcast-clip-card" role="listitem">
                        <Link
                          href={`/podcasts/${show.slug}/${episode.slug}/`}
                          className="podcast-clip-link"
                          onClick={() => handleOpenPodcastEpisode(show, episode)}
                        >
                          <div className="podcast-clip-art-shell">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={show.title}
                                className="podcast-clip-art"
                                loading="lazy"
                                decoding="async"
                                onError={() =>
                                  setFailedClipImages((prev) => ({
                                    ...prev,
                                    [imageKey]: true,
                                  }))
                                }
                              />
                            ) : (
                              <div className="podcast-clip-art podcast-card-art-fallback">
                                <span>{show.title.slice(0, 2).toUpperCase()}</span>
                              </div>
                            )}
                            <div className="podcast-clip-badge">Clip</div>
                          </div>
                          <div className="podcast-clip-copy">
                            <span className="podcast-card-publisher">{show.publisher}</span>
                            <strong className="podcast-card-title">{episode.title}</strong>
                            <span className="podcast-card-date">
                              {episode.publishedAt ? formatRelativeTimestamp(episode.publishedAt) : "Latest episode"}
                            </span>
                          </div>
                        </Link>
                        {renderPodcastInteractionRow(show, episode)}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {(topNewsPodcasts.length > 0 ||
              topSportsPodcasts.length > 0 ||
              topBusinessPodcasts.length > 0 ||
              topComedyPodcasts.length > 0) ? (
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Podcast Charts</strong>
                    <span className="muted">A fast read on what is leading each lane right now.</span>
                  </div>
                </div>
                <div className="podcast-chart-grid">
                  {[
                    { label: "Top News Podcasts", shows: topNewsPodcasts },
                    { label: "Top Sports Podcasts", shows: topSportsPodcasts },
                    { label: "Top Business Podcasts", shows: topBusinessPodcasts },
                    { label: "Top Comedy Podcasts", shows: topComedyPodcasts },
                  ]
                    .filter((section) => section.shows.length > 0)
                    .map((section) => (
                      <article key={section.label} className="podcast-chart-card">
                        <strong className="podcast-chart-title">{section.label}</strong>
                        <div className="stack" style={{ gap: "10px" }}>
                          {section.shows.map((show, index) => (
                            <Link
                              key={`${section.label}-${show.slug}`}
                              href={`/podcasts/${show.slug}/`}
                              className="podcast-chart-row"
                              onClick={() => handleOpenPodcastEpisode(show, show.latestEpisode)}
                            >
                              <span className="podcast-chart-rank">{index + 1}</span>
                              <span className="podcast-chart-copy">
                                <strong>{show.title}</strong>
                                <span>{show.publisher}</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ) : null}

            {continueListeningItems.length > 0 ? (
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Continue Listening</strong>
                    <span className="muted">Jump back into the episodes you already started.</span>
                  </div>
                </div>
                <div className="podcast-progress-grid">
                  {continueListeningItems.map(({ show, episode, progress }) => (
                    <Link
                      key={`continue-${show.slug}-${episode.slug}`}
                      href={`/podcasts/${show.slug}/${episode.slug}/`}
                      className="podcast-progress-card"
                      onClick={() => handleOpenPodcastEpisode(show, episode)}
                    >
                      <div className="podcast-progress-copy">
                        <strong>{show.title}</strong>
                        <span>{episode.title}</span>
                      </div>
                      <div className="podcast-progress-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(progress * 100)}%` }} />
                      </div>
                      <span className="podcast-card-date">{Math.round(progress * 100)}% complete</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {(pulseMostDiscussed.length > 0 ||
              pulseFastestGrowing.length > 0 ||
              pulseMostShared.length > 0) ? (
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Podcast Pulse</strong>
                    <span className="muted">See what is heating up across discussion, growth, and sharing.</span>
                  </div>
                </div>
                <div className="podcast-chart-grid">
                  {[
                    { label: "Most Discussed", shows: pulseMostDiscussed },
                    { label: "Fastest Growing", shows: pulseFastestGrowing },
                    { label: "Most Shared", shows: pulseMostShared },
                  ].map((section) => (
                    <article key={section.label} className="podcast-chart-card">
                      <strong className="podcast-chart-title">{section.label}</strong>
                      <div className="stack" style={{ gap: "10px" }}>
                        {section.shows.map((show) => (
                          <Link
                            key={`${section.label}-${show.slug}`}
                            href={`/podcasts/${show.slug}/`}
                            className="podcast-pulse-row"
                            onClick={() => handleOpenPodcastEpisode(show, show.latestEpisode)}
                          >
                            <strong>{show.title}</strong>
                            <span>{show.publisher}</span>
                          </Link>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {discoverShow ? (
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">Discover Something New</strong>
                    <span className="muted">A fresh recommendation when you want a new voice in the mix.</span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setDiscoverSeed((prev) => prev + 1)}
                  >
                    Shuffle
                  </button>
                </div>
                <article className="podcast-discovery-card">
                  <Link
                    href={`/podcasts/${discoverShow.slug}/`}
                    className="podcast-discovery-link"
                    onClick={() => handleOpenPodcastEpisode(discoverShow, discoverShow.latestEpisode)}
                  >
                    <div className="podcast-discovery-copy">
                      <span className="chip">Random Pick</span>
                      <strong className="podcast-card-title">{discoverShow.title}</strong>
                      <span className="podcast-card-publisher">{discoverShow.publisher}</span>
                      <p className="podcast-card-episode-title">{getPodcastCardDescription(discoverShow)}</p>
                    </div>
                  </Link>
                  {renderPodcastInteractionRow(discoverShow, discoverShow.latestEpisode)}
                </article>
              </section>
            ) : null}

            <PodcastSectionRow title="Featured Podcasts" shows={directory.sections.featured} />
            <PodcastSectionRow title="Science" shows={directory.sections.science} />
            <PodcastSectionRow title="True Crime" shows={directory.sections.trueCrime} />
            <PodcastSectionRow title="Arts" shows={directory.sections.arts} />
            <PodcastSectionRow title="Business" shows={directory.sections.business} />
            <PodcastSectionRow title="Sports" shows={directory.sections.sports} />
            <PodcastSectionRow title="Politics" shows={directory.sections.politics} />
          </div>
        )}
      </section>
    </section>
  );
}
