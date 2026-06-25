"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buildApiUrl, isNativeCapacitorRuntime } from "../../../../lib/api-base";
import { buildStaticFallbackPodcastDirectory } from "../../../../lib/podcasts";
import { formatRelativeTimestamp } from "../../../../lib/relative-time";

type PodcastEpisode = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  description: string | null;
  audioUrl: string | null;
  duration: string | null;
};

type PodcastShow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  publisher: string;
  category: "Science" | "True Crime" | "Arts" | "Business" | "Sports" | "Politics";
  image: string | null;
  coverArt: string | null;
  featured: boolean;
  feedUrl: string;
  episodeCount: number;
  sourceProvider: string;
  episodes: PodcastEpisode[];
};

type PodcastResponse = {
  podcast: {
    show: PodcastShow;
    episode: PodcastEpisode;
  } | null;
};

type PodcastShowResponse = {
  podcast: {
    show: PodcastShow;
    episode: PodcastEpisode | null;
  } | null;
};

function findLocalPodcastEpisode(podcastSlug: string, episodeSlug: string) {
  const show =
    buildStaticFallbackPodcastDirectory().shows.find((entry) => entry.slug === podcastSlug) ?? null;
  return findEpisodeInShow(show, episodeSlug);
}

function findEpisodeInShow(show: PodcastShow | null, episodeSlug: string) {
  if (!show) {
    return null;
  }

  console.log(
    "PODCAST_EPISODE_AVAILABLE_IDS",
    show.episodes.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
    }))
  );

  const episode =
    show.episodes.find((entry) => entry.slug === episodeSlug || entry.id === episodeSlug) ?? null;

  return episode ? { show, episode } : null;
}

function getRememberedPodcastEpisode(podcastSlug: string, episodeSlug: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem("graffiti:selected-podcast-episode");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PodcastResponse["podcast"];
    if (
      parsed?.show?.slug === podcastSlug &&
      (parsed.episode?.slug === episodeSlug || parsed.episode?.id === episodeSlug)
    ) {
      console.log(
        "PODCAST_EPISODE_AVAILABLE_IDS",
        parsed.show.episodes.map((entry) => ({
          id: entry.id,
          slug: entry.slug,
        }))
      );
      return parsed;
    }
  } catch (error) {
    console.warn("PODCAST EPISODE SESSION READ FAILED", error);
  }

  return null;
}

export default function PodcastEpisodePage() {
  const params = useParams<{ podcastSlug?: string; episodeSlug?: string }>();
  const podcastSlug = params?.podcastSlug;
  const episodeSlug = params?.episodeSlug;
  const [payload, setPayload] = useState<PodcastResponse["podcast"]>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEpisode() {
      setIsLoading(true);

      if (!podcastSlug || !episodeSlug) {
        if (isMounted) {
          setPayload(null);
          setIsLoading(false);
        }
        return;
      }

      console.log("PODCAST_EPISODE_SELECTED_PODCAST", { slug: podcastSlug });
      console.log("PODCAST_EPISODE_SELECTED_EPISODE", { slug: episodeSlug });

      const rememberedPodcast = getRememberedPodcastEpisode(podcastSlug, episodeSlug);
      const localPodcast = rememberedPodcast ?? findLocalPodcastEpisode(podcastSlug, episodeSlug);
      let nextPayload = localPodcast;

      if (localPodcast && isMounted) {
        setPayload(localPodcast);
      }

      const requestPath = `/api/podcasts?podcastSlug=${encodeURIComponent(podcastSlug)}&episodeSlug=${encodeURIComponent(episodeSlug)}`;
      const requestUrl = buildApiUrl(requestPath);
      console.log("PODCAST_EPISODE_REQUEST_URL", requestUrl);

      try {
        const response = await fetch(requestUrl, {
          cache: isNativeCapacitorRuntime() ? "no-store" : "default",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          console.warn("PODCAST EPISODE LOAD UNAVAILABLE", {
            url: requestUrl,
            status: response.status,
          });
        } else {
          const data = (await response.json().catch(() => ({ podcast: null }))) as PodcastResponse;
          nextPayload = data.podcast ?? nextPayload;
        }
      } catch (error) {
        console.warn("PODCAST EPISODE LOAD FAILED", {
          url: requestUrl,
          error,
        });
      }

      if (!isMounted) {
        return;
      }

      if (!nextPayload) {
        const showRequestPath = `/api/podcasts?podcastSlug=${encodeURIComponent(podcastSlug)}`;
        const showRequestUrl = buildApiUrl(showRequestPath);
        console.log("PODCAST_SHOW_EPISODES_REQUEST_URL", showRequestUrl);

        try {
          const response = await fetch(showRequestUrl, {
            cache: isNativeCapacitorRuntime() ? "no-store" : "default",
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            console.warn("PODCAST SHOW EPISODES LOAD UNAVAILABLE", {
              url: showRequestUrl,
              status: response.status,
            });
          } else {
            const data = (await response.json().catch(() => ({ podcast: null }))) as PodcastShowResponse;
            nextPayload = findEpisodeInShow(data.podcast?.show ?? null, episodeSlug);
          }
        } catch (showError) {
          console.warn("PODCAST SHOW EPISODES LOAD FAILED", {
            url: showRequestUrl,
            error: showError,
          });
        }
      }

      if (isMounted) {
        setPayload(nextPayload);
        setIsLoading(false);
      }
    }

    void loadEpisode();

    return () => {
      isMounted = false;
    };
  }, [episodeSlug, podcastSlug]);

  useEffect(() => {
    const headerTitle =
      payload?.show.title?.trim() ||
      payload?.show.publisher?.trim() ||
      "Podcast";

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("reflekt:podcast-title", { detail: headerTitle }));
    }
  }, [payload]);

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        {isLoading ? (
          <div className="muted">Loading episode...</div>
        ) : !payload ? (
          <div className="empty-state compact-empty-state">
            <strong>Podcast episode unavailable.</strong>
            <span>Try another show or check back after the feed refreshes.</span>
          </div>
        ) : (
          <div className="podcast-player-shell">
            <div className="podcast-episode-back-row">
              <Link
                href={`/podcasts/${payload.show.slug || podcastSlug}/`}
                className="profile-section-icon-button podcast-episode-back-button"
                aria-label={`Back to ${payload.show.title}`}
              >
                <span aria-hidden="true">←</span>
              </Link>
            </div>

            <div className="podcast-player-hero">
              <div className="podcast-player-art-shell" aria-hidden="true">
                {payload.show.image || payload.show.coverArt ? (
                  <img
                    src={payload.show.image || payload.show.coverArt || ""}
                    alt={payload.show.title}
                    className="podcast-player-art"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="podcast-player-art podcast-card-art-fallback">
                    <span>{payload.show.title.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="podcast-player-copy">
                <span className="podcast-card-publisher">{payload.show.publisher}</span>
                <h1 className="podcast-player-title">{payload.episode.title}</h1>
                <span className="podcast-card-date">
                  {formatRelativeTimestamp(payload.episode.publishedAt)}
                  {payload.episode.duration ? ` · ${payload.episode.duration}` : ""}
                </span>
              </div>
            </div>

            {payload.episode.audioUrl ? (
              <audio className="podcast-audio-player" controls preload="none">
                <source src={payload.episode.audioUrl} />
              </audio>
            ) : null}

            {payload.episode.description ? (
              <div className="section-card stack">
                <strong className="profile-section-title-sm">Episode Notes</strong>
                <p className="podcast-episode-description">{payload.episode.description}</p>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </section>
  );
}
