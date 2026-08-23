"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api-base";
import {
  buildStaticFallbackPodcastDirectory,
  type PodcastEpisode,
  type PodcastShow,
} from "../../../lib/podcasts";

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

function getPodcastImageCandidates(show: PodcastShow) {
  const unique = new Set<string>();

  return [
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
}

function formatPodcastDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

type PodcastShowResponse = {
  podcast: {
    show: PodcastShow;
    episode: PodcastEpisode | null;
  } | null;
};

function rememberClickedPodcastEpisode(show: PodcastShow, episode: PodcastEpisode) {
  console.log("PODCAST_EPISODE_CLICKED_PODCAST", {
    id: show.id,
    slug: show.slug,
  });
  console.log("PODCAST_EPISODE_CLICKED_EPISODE", {
    id: episode.id,
    slug: episode.slug,
  });
  console.log(
    "PODCAST_EPISODE_AVAILABLE_IDS",
    show.episodes.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
    }))
  );

  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    "graffiti:selected-podcast-episode",
    JSON.stringify({ show, episode })
  );
}

export default function PodcastShowPage() {
  const params = useParams<{ podcastSlug?: string }>();
  const podcastSlug = params?.podcastSlug;
  const fallbackShow = useMemo(
    () =>
      buildStaticFallbackPodcastDirectory().shows.find((entry) => entry.slug === podcastSlug) ??
      null,
    [podcastSlug]
  );
  const [show, setShow] = useState<PodcastShow | null>(fallbackShow);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(true);
  const [episodesUnavailable, setEpisodesUnavailable] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const isBloombergBusinessweek = podcastSlug === "bloomberg-businessweek";

  useEffect(() => {
    console.log("PODCAST DETAIL OPENED", {
      podcastSlug,
      fallbackId: fallbackShow?.id ?? null,
      fallbackTitle: fallbackShow?.title ?? null,
      fallbackEpisodeCount: fallbackShow?.episodes.length ?? 0,
    });
    if (isBloombergBusinessweek) {
      console.log("PODCAST_SELECTED_SLUG", podcastSlug);
      console.log("PODCAST_SELECTED_TITLE", fallbackShow?.title ?? null);
      console.log("PODCAST_EPISODE_SOURCE_URL", fallbackShow?.feedUrl ?? null);
      console.log("PODCAST_EPISODE_COUNT", fallbackShow?.episodes.length ?? 0);
    }
  }, [fallbackShow, isBloombergBusinessweek, podcastSlug]);

  useEffect(() => {
    const headerTitle =
      show?.title?.trim() ||
      show?.publisher?.trim() ||
      "Podcast";

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("reflekt:podcast-title", { detail: headerTitle }));
    }
  }, [show]);

  useEffect(() => {
    let isMounted = true;

    async function loadPodcastShow() {
      console.log("PODCAST EPISODES_FETCH_STARTED", {
        podcastSlug,
        fallbackId: fallbackShow?.id ?? null,
        fallbackTitle: fallbackShow?.title ?? null,
        fallbackEpisodeCount: fallbackShow?.episodes.length ?? 0,
      });
      setIsLoadingEpisodes(true);
      setEpisodesUnavailable(false);

      if (!podcastSlug) {
        if (isMounted) {
          setShow(null);
          setIsLoadingEpisodes(false);
        }
        return;
      }

      try {
        const requestPath = `/api/podcasts?podcastSlug=${encodeURIComponent(podcastSlug)}`;
        const timeoutMs = 6000;
        let timeoutId: number | null = null;
        console.log("PODCAST_EPISODES_REQUEST_URL", requestPath);
        const response = await Promise.race([
          apiFetch(requestPath),
          new Promise<null>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
          }),
        ]);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        if (!response) {
          if (isBloombergBusinessweek) {
            console.log("PODCAST_EPISODE_ERROR", `Podcast episodes request timed out after ${timeoutMs}ms`);
          }
          console.warn("PODCAST_EPISODES_FETCH_WARNING", {
            podcastSlug,
            message: `Podcast episodes request timed out after ${timeoutMs}ms`,
          });
          if (isMounted) {
            setShow(fallbackShow);
            setEpisodesUnavailable(true);
          }
          return;
        }

        const data = (await response.json()) as PodcastShowResponse;

        if (!isMounted) {
          return;
        }

        if (data.podcast?.show) {
          if (isBloombergBusinessweek) {
            console.log("PODCAST_SELECTED_SLUG", data.podcast.show.slug);
            console.log("PODCAST_SELECTED_TITLE", data.podcast.show.title);
            console.log("PODCAST_EPISODE_SOURCE_URL", data.podcast.show.feedUrl ?? null);
            console.log("PODCAST_EPISODE_COUNT", data.podcast.show.episodes.length);
          }
          console.log("PODCAST_DETAIL_SHOW_LOADED", {
            id: data.podcast.show.id,
            slug: data.podcast.show.slug,
            title: data.podcast.show.title,
            episodeCount: data.podcast.show.episodes.length,
          });
          setShow(data.podcast.show);
          setEpisodesUnavailable(data.podcast.show.episodes.length === 0);
        } else {
          if (isBloombergBusinessweek) {
            console.log("PODCAST_EPISODE_ERROR", "Podcast API returned no show");
          }
          console.warn("PODCAST_EPISODES_FETCH_WARNING", {
            podcastSlug,
            message: "Podcast API returned no show",
          });
          setShow(fallbackShow);
          setEpisodesUnavailable(true);
        }
      } catch (error) {
        if (isBloombergBusinessweek) {
          console.log("PODCAST_EPISODE_ERROR", error instanceof Error ? error.message : String(error));
        }
        console.warn("PODCAST_EPISODES_FETCH_WARNING", {
          podcastSlug,
          message: error instanceof Error ? error.message : String(error),
        });
        if (isMounted) {
          setShow(fallbackShow);
          setEpisodesUnavailable(true);
        }
      } finally {
        if (isMounted) {
          setIsLoadingEpisodes(false);
        }
      }
    }

    void loadPodcastShow();

    return () => {
      isMounted = false;
    };
  }, [fallbackShow, isBloombergBusinessweek, podcastSlug]);

  if (!show) {
    return (
      <section className="page-shell home-sections-shell">
        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="empty-state compact-empty-state">
            <strong>Podcast unavailable.</strong>
            <span>Try another show or check back shortly.</span>
          </div>
        </section>
      </section>
    );
  }

  const imageCandidates = getPodcastImageCandidates(show);
  const imageUrl =
    imageCandidates.find((candidate) => !failedImages[`${show.slug}:${candidate}`]) ?? null;

  if (imageUrl?.startsWith("/podcast-covers/")) {
    console.log("PODCAST_LOCAL_COVER_USED", {
      slug: show.slug,
      imageUrl,
    });
  } else if (imageUrl) {
    console.log("PODCAST_REMOTE_COVER_USED", {
      slug: show.slug,
      imageUrl,
    });
  } else {
    console.log("PODCAST_COVER_MISSING", {
      slug: show.slug,
    });
  }

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="podcast-player-shell">
          <div className="podcast-player-hero">
            <div className="podcast-player-art-shell" aria-hidden="true">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={show.title}
                  className="podcast-player-art"
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setFailedImages((prev) => ({
                      ...prev,
                      [`${show.slug}:${imageUrl}`]: true,
                    }));
                  }}
                />
              ) : (
                <div className="podcast-player-art podcast-card-art-fallback">
                  <span>{show.title.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="podcast-player-copy">
              <span className="podcast-card-publisher">{show.publisher}</span>
              <h1 className="podcast-player-title">{show.title}</h1>
              <span className="podcast-card-date">
                {show.episodeCount > 0 ? `${show.episodeCount} episodes` : "Podcast"}
              </span>
              <p className="podcast-episode-description">
                {show.description ||
                  show.summary ||
                  show.artistName ||
                  show.publisher ||
                  "Latest episodes and updates from this podcast."}
              </p>
            </div>
          </div>

          {isLoadingEpisodes ? <div className="muted">Loading episodes...</div> : null}

          {show.latestEpisode?.audioUrl ? (
            <audio className="podcast-audio-player" controls preload="none">
              <source src={show.latestEpisode.audioUrl} />
            </audio>
          ) : null}

          {show.episodes.length > 0 ? (
            <div className="stack home-section-list">
              {show.episodes.slice(0, 12).map((episode) => (
                <Link
                  key={episode.id}
                  href={`/podcasts/${show.slug}/${episode.slug}/`}
                  className="section-card stack"
                  onClick={() => rememberClickedPodcastEpisode(show, episode)}
                >
                  <strong className="profile-section-title-sm">{episode.title}</strong>
                  {formatPodcastDate(episode.publishedAt) || episode.duration ? (
                    <span className="muted">
                      {[formatPodcastDate(episode.publishedAt), episode.duration]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : !isLoadingEpisodes || episodesUnavailable ? (
            <div className="empty-state compact-empty-state">
              <strong>Episodes unavailable.</strong>
              <span>
                We could not load episodes for this podcast right now. Try another show or check back after the feed refreshes.
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
