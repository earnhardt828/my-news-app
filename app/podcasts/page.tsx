"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-base";
import { formatRelativeTimestamp } from "../../lib/relative-time";

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
  category:
    | "World News"
    | "Sports"
    | "Celebrity"
    | "Music"
    | "Movies"
    | "Business"
    | "Technology"
    | "Food"
    | "Travel";
  coverArt: string | null;
  featured: boolean;
  latestEpisode: PodcastEpisode | null;
};

type PodcastDirectoryResponse = {
  shows: PodcastShow[];
  sections: {
    featured: PodcastShow[];
    worldNews: PodcastShow[];
    sports: PodcastShow[];
    celebrity: PodcastShow[];
    music: PodcastShow[];
    movies: PodcastShow[];
    business: PodcastShow[];
    technology: PodcastShow[];
    food: PodcastShow[];
    travel: PodcastShow[];
  };
};

function PodcastSectionRow({
  title,
  shows,
}: {
  title: string;
  shows: PodcastShow[];
}) {
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

          if (!latestEpisode) {
            return null;
          }

          return (
            <Link
              key={`${title}-${show.slug}`}
              href={`/podcasts/${show.slug}/${latestEpisode.slug}/`}
              className="podcast-card"
              role="listitem"
            >
              <div className="podcast-card-art-shell" aria-hidden="true">
                {show.coverArt ? (
                  <img
                    src={show.coverArt}
                    alt={show.title}
                    className="podcast-card-art"
                    loading="lazy"
                    decoding="async"
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
                <p className="podcast-card-episode-title">{latestEpisode.title}</p>
                <span className="podcast-card-date">
                  {formatRelativeTimestamp(latestEpisode.publishedAt)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function PodcastsPage() {
  const [directory, setDirectory] = useState<PodcastDirectoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPodcasts() {
      setIsLoading(true);

      try {
        const response = await apiFetch("/api/podcasts");
        const payload = (await response.json()) as PodcastDirectoryResponse;

        if (!isMounted) {
          return;
        }

        setDirectory(payload);
      } catch (error) {
        console.error("PODCAST DIRECTORY LOAD FAILED", error);

        if (isMounted) {
          setDirectory({
            shows: [],
            sections: {
              featured: [],
              worldNews: [],
              sports: [],
              celebrity: [],
              music: [],
              movies: [],
              business: [],
              technology: [],
              food: [],
              travel: [],
            },
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
  }, []);

  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Podcasts</strong>
          </div>
        </div>

        {isLoading ? (
          <div className="muted">Loading podcasts...</div>
        ) : !directory || directory.shows.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <strong>No podcasts available right now.</strong>
            <span>Check back shortly while the podcast feeds refresh.</span>
          </div>
        ) : (
          <div className="stack home-section-list">
            <PodcastSectionRow title="Featured Podcasts" shows={directory.sections.featured} />
            <PodcastSectionRow title="World News" shows={directory.sections.worldNews} />
            <PodcastSectionRow title="Sports" shows={directory.sections.sports} />
            <PodcastSectionRow title="Celebrity" shows={directory.sections.celebrity} />
            <PodcastSectionRow title="Music" shows={directory.sections.music} />
            <PodcastSectionRow title="Movies" shows={directory.sections.movies} />
            <PodcastSectionRow title="Business" shows={directory.sections.business} />
            <PodcastSectionRow title="Technology" shows={directory.sections.technology} />
            <PodcastSectionRow title="Food" shows={directory.sections.food} />
            <PodcastSectionRow title="Travel" shows={directory.sections.travel} />
          </div>
        )}
      </section>
    </section>
  );
}
