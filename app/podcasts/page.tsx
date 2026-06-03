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
  latestEpisode: PodcastEpisode | null;
};

type PodcastDirectoryResponse = {
  shows: PodcastShow[];
  sections: {
    featured: PodcastShow[];
    science: PodcastShow[];
    trueCrime: PodcastShow[];
    arts: PodcastShow[];
    business: PodcastShow[];
    sports: PodcastShow[];
    politics: PodcastShow[];
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
                {show.image || show.coverArt ? (
                  <img
                    src={show.image || show.coverArt || ""}
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
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadPodcasts() {
      setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
          params.set("q", searchQuery.trim());
        }

        const response = await apiFetch(`/api/podcasts${params.toString() ? `?${params.toString()}` : ""}`);
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
              science: [],
              trueCrime: [],
              arts: [],
              business: [],
              sports: [],
              politics: [],
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
  }, [searchQuery]);

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
