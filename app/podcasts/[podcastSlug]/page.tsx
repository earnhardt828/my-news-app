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
import { formatRelativeTimestamp } from "../../../lib/relative-time";

type PodcastShowResponse = {
  podcast: {
    show: PodcastShow;
    episode: PodcastEpisode | null;
  } | null;
};

export default function PodcastShowPage() {
  const params = useParams<{ podcastSlug: string }>();
  const fallbackShow =
    buildStaticFallbackPodcastDirectory().shows.find((entry) => entry.slug === params.podcastSlug) ?? null;
  const [show, setShow] = useState<PodcastShow | null>(fallbackShow);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(true);

  useEffect(() => {
    console.log("PODCAST DETAIL OPENED", { podcastSlug: params.podcastSlug });
  }, [params.podcastSlug]);

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
      console.log("PODCAST EPISODES_FETCH_STARTED", { podcastSlug: params.podcastSlug });
      setIsLoadingEpisodes(true);

      try {
        const response = await apiFetch(`/api/podcasts?podcastSlug=${encodeURIComponent(params.podcastSlug)}`);
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
  }, [params.podcastSlug]);

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

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="podcast-player-shell">
          <div className="podcast-player-hero">
            <div className="podcast-player-art-shell" aria-hidden="true">
              {show.image || show.coverArt ? (
                <img
                  src={show.image || show.coverArt || ""}
                  alt={show.title}
                  className="podcast-player-art"
                  loading="lazy"
                  decoding="async"
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
              {show.description ? (
                <p className="podcast-episode-description">{show.description}</p>
              ) : null}
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
                  <span className="muted">
                    {formatRelativeTimestamp(episode.publishedAt)}
                    {episode.duration ? ` · ${episode.duration}` : ""}
                  </span>
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
