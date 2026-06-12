"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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

export default function PodcastShowPage() {
  const params = useParams<{ podcastSlug?: string }>();
  const podcastSlug = params?.podcastSlug;
  const fallbackShow =
    buildStaticFallbackPodcastDirectory().shows.find((entry) => entry.slug === podcastSlug) ?? null;
  const [show, setShow] = useState<PodcastShow | null>(fallbackShow);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    console.log("PODCAST DETAIL OPENED", { podcastSlug });
  }, [podcastSlug]);

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
      console.log("PODCAST EPISODES_FETCH_STARTED", { podcastSlug });
      setIsLoadingEpisodes(true);

      if (!podcastSlug) {
        if (isMounted) {
          setShow(null);
          setIsLoadingEpisodes(false);
        }
        return;
      }

      try {
        const response = await apiFetch(`/api/podcasts?podcastSlug=${encodeURIComponent(podcastSlug)}`);
        const data = (await response.json()) as PodcastShowResponse;

        if (!isMounted) {
          return;
        }

        if (data.podcast?.show) {
          setShow(data.podcast.show);
        }
      } catch (error) {
        console.error("PODCAST SHOW PAGE LOAD FAILED", error);
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
  }, [podcastSlug]);

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
          ) : !isLoadingEpisodes ? (
            <div className="muted">Loading episodes...</div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
