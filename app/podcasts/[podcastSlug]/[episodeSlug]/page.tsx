"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-base";
import { formatRelativeTimestamp } from "../../../../lib/relative-time";

type PodcastEpisode = {
  slug: string;
  title: string;
  publishedAt: string | null;
  description: string | null;
  audioUrl: string | null;
  duration: string | null;
};

type PodcastShow = {
  slug: string;
  title: string;
  publisher: string;
  category: "News" | "Sports" | "Business" | "Technology";
  coverArt: string | null;
  featured: boolean;
};

type PodcastResponse = {
  podcast: {
    show: PodcastShow;
    episode: PodcastEpisode;
  } | null;
};

export default function PodcastEpisodePage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const [payload, setPayload] = useState<PodcastResponse["podcast"]>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEpisode() {
      setIsLoading(true);

      try {
        const response = await apiFetch(
          `/api/podcasts?podcastSlug=${encodeURIComponent(params.podcastSlug)}&episodeSlug=${encodeURIComponent(
            params.episodeSlug
          )}`
        );
        const data = (await response.json()) as PodcastResponse;

        if (!isMounted) {
          return;
        }

        setPayload(data.podcast);
      } catch (error) {
        console.error("PODCAST EPISODE LOAD FAILED", error);

        if (isMounted) {
          setPayload(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadEpisode();

    return () => {
      isMounted = false;
    };
  }, [params.episodeSlug, params.podcastSlug]);

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="home-section-header">
          <Link href="/podcasts/" className="button button-secondary">
            Back
          </Link>
          <div className="stack" style={{ gap: "4px", flex: 1 }}>
            <strong className="profile-section-title home-section-title">Podcast Player</strong>
          </div>
        </div>

        {isLoading ? (
          <div className="muted">Loading episode...</div>
        ) : !payload ? (
          <div className="empty-state compact-empty-state">
            <strong>Podcast episode unavailable.</strong>
            <span>Try another show or check back after the feed refreshes.</span>
          </div>
        ) : (
          <div className="podcast-player-shell">
            <div className="podcast-player-hero">
              <div className="podcast-player-art-shell" aria-hidden="true">
                {payload.show.coverArt ? (
                  <img
                    src={payload.show.coverArt}
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
