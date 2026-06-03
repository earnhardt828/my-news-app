"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-base";
import {
  buildStaticFallbackPodcastDirectory,
  PODCAST_INDEX_BACKGROUND_ONLY,
  type PodcastDirectory,
  type PodcastShow,
} from "../../lib/podcasts";
import { formatRelativeTimestamp } from "../../lib/relative-time";

type PodcastEpisode = {
  slug: string;
  title: string;
  publishedAt: string | null;
  description: string | null;
  audioUrl: string | null;
  duration: string | null;
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
          const cardContent = (
            <>
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
                <p className="podcast-card-episode-title">
                  {latestEpisode?.title || show.description || "Feed details are refreshing."}
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

  useEffect(() => {
    console.log("PODCASTS PAGE INITIAL_RENDER", {
      fallbackCount: directory.shows.length,
      podcastIndexBackgroundOnly: PODCAST_INDEX_BACKGROUND_ONLY,
    });
  }, []);

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

        {!directory || directory.shows.length === 0 ? (
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
