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
  const rawDescription =
    show.description ||
    show.summary ||
    show.artistName ||
    show.publisher ||
    "Latest episodes and updates from this podcast.";

  const normalized = rawDescription.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Latest episodes and updates from this podcast.";
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function getPodcastCardEyebrow(show: PodcastShow) {
  const parts = [show.category, show.publisher]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const uniqueParts = parts.filter(
    (value, index) =>
      parts.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
  );

  return uniqueParts.join(" • ");
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
                    <span className="podcast-card-art-fallback-badge">Graffiti</span>
                    <strong>{show.title.slice(0, 2).toUpperCase()}</strong>
                    <small>Podcast</small>
                  </div>
                )}
              </div>
              <div className="podcast-card-copy">
                <strong className="podcast-card-title">{show.title}</strong>
                <span className="podcast-card-publisher">{getPodcastCardEyebrow(show)}</span>
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
  const [directory, setDirectory] = useState<PodcastDirectory>(
    buildStaticFallbackPodcastDirectory()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const podcastDirectoryCacheKey = "graffiti:podcasts:directory";

  useEffect(() => {
    console.log("PODCASTS PAGE INITIAL_RENDER", {
      fallbackCount: directory.shows.length,
      podcastIndexBackgroundOnly: PODCAST_INDEX_BACKGROUND_ONLY,
    });
    console.log("PODCAST_COVERS_SYNCED", true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPodcasts() {
      const baseDirectory = buildStaticFallbackPodcastDirectory();
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(podcastDirectoryCacheKey);
          if (raw) {
            const cachedDirectory = JSON.parse(raw) as PodcastDirectory;
            if (cachedDirectory?.shows?.length) {
              setDirectory(cachedDirectory);
            }
          }
        } catch (error) {
          console.error("PODCAST CACHE READ FAILED", error);
        }
      }
      if (isMounted) {
        setDirectory(baseDirectory);
      }

      setIsLoading(true);
      if (isMounted) {
        setLoadError(null);
      }

      try {
        const response = await Promise.race([
          apiFetch("/api/podcasts"),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Podcasts request timed out")), 6000);
          }),
        ]);
        const payload = (await response.json()) as PodcastDirectory;

        if (!isMounted) {
          return;
        }

        if (payload.shows.length > 0) {
          setDirectory(payload);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(podcastDirectoryCacheKey, JSON.stringify(payload));
          }
        } else {
          setDirectory(baseDirectory);
        }
      } catch (error) {
        console.error("PODCAST DIRECTORY LOAD FAILED", error);

        if (isMounted) {
          setDirectory(baseDirectory);
          setLoadError("Could not refresh podcasts right now. Showing the latest available picks.");
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
        {isLoading ? <div className="muted">Refreshing podcasts...</div> : null}
        {loadError ? <div className="muted">{loadError}</div> : null}

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
