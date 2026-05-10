"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { apiFetch } from "../../lib/api-base";
import ShareButton from "../components/share-button";
import SourceBadge from "../components/source-badge";
import {
  buildVideoEmbedUrl,
  initialVideos,
  normalizeVideoFeedItems,
  type VideoApiItem,
  type VideoItem,
} from "../../lib/video-feed";

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function rankVideos(videos: VideoItem[]) {
  return [...videos].sort((a, b) => {
    const popularityDifference =
      (b.views ?? 0) - (a.views ?? 0) ||
      b.likes - a.likes ||
      b.comments - a.comments;

    if (popularityDifference !== 0) {
      return popularityDifference;
    }

    const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return timeB - timeA;
  });
}

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [autoplayVideoId, setAutoplayVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const videoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    async function loadVideos() {
      const shouldBlockScreen = !hasLoadedOnceRef.current;
      setIsLoading(true);

      try {
        const response = await apiFetch("/api/videos");
        const data = (await response.json()) as {
          videos?: VideoApiItem[];
          fallback?: boolean;
          message?: string;
        };

        const normalizedVideos = rankVideos(normalizeVideoFeedItems(data.videos));
        setVideos(normalizedVideos);
        setStatusMessage(data.fallback ? data.message ?? "" : "");
      } catch (error) {
        console.error("Error loading video feed:", error);
        setVideos(rankVideos(initialVideos));
        setStatusMessage("Could not load live videos, so the current feed is shown instead.");
      } finally {
        setIsLoading(false);
        if (shouldBlockScreen) {
          hasLoadedOnceRef.current = true;
          setHasLoadedOnce(true);
        }
      }
    }

    void loadVideos();
  }, []);

  useEffect(() => {
    const playableVideos = videos.filter(
      (video) => !video.fallback && Boolean(video.youtubeId)
    );

    if (playableVideos.length === 0) {
      return;
    }

    const visibilityMap = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoId = (entry.target as HTMLDivElement).dataset.videoId;

          if (!videoId) {
            return;
          }

          visibilityMap.set(
            videoId,
            entry.isIntersecting ? entry.intersectionRatio : 0
          );
        });

        let nextAutoplayId: string | null = null;
        let highestRatio = 0;

        visibilityMap.forEach((ratio, videoId) => {
          if (ratio > highestRatio) {
            highestRatio = ratio;
            nextAutoplayId = videoId;
          }
        });

        setAutoplayVideoId(highestRatio >= 0.72 ? nextAutoplayId : null);
      },
      {
        threshold: [0.35, 0.5, 0.72, 0.88],
      }
    );

    playableVideos.forEach((video) => {
      const node = videoFrameRefs.current[video.id];

      if (!node) {
        return;
      }

      visibilityMap.set(video.id, 0);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [videos]);

  const activeVideo = useMemo(
    () => videos.find((video) => video.id === activeVideoId) ?? null,
    [activeVideoId, videos]
  );

  const activeCommentsVideo = useMemo(
    () =>
      activeCommentsVideoId === null
        ? null
        : videos.find((video) => video.id === activeCommentsVideoId) ?? null,
    [activeCommentsVideoId, videos]
  );

  const handleToggleLike = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId
          ? {
              ...video,
              liked: !video.liked,
              likes: video.liked ? Math.max(0, video.likes - 1) : video.likes + 1,
            }
          : video
      );

    setVideos((prev) =>
      updateVideos(prev)
    );
  };

  const handleToggleSave = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      );

    setVideos((prev) =>
      updateVideos(prev)
    );
  };

  return (
    <section className="reels-shell videos-page-shell">
      {statusMessage ? <div className="chip chip-accent reels-status">{statusMessage}</div> : null}
      {isLoading && hasLoadedOnce ? (
        <div className="muted reels-inline-status">Refreshing videos...</div>
      ) : null}

      {isLoading && !hasLoadedOnce ? (
        <div className="loading-state">
          <strong>Loading videos...</strong>
          <span>{statusMessage || "Fetching the latest channel feed."}</span>
        </div>
      ) : null}

      <div className="reels-feed">
        {videos.map((video) => {
            const isAutoplaying = autoplayVideoId === video.id && !video.fallback;

            return (
              <article key={video.id} className="reel-card">
                <div
                  ref={(node) => {
                    videoFrameRefs.current[video.id] = node;
                  }}
                  data-video-id={video.id}
                  className="reel-media"
                >
                  {video.thumbnailUrl ? (
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.title}
                      fill
                      sizes="100vw"
                      className="reel-thumbnail"
                      unoptimized
                    />
                  ) : null}

                  {isAutoplaying ? (
                    <iframe
                      src={buildVideoEmbedUrl(video.youtubeId, true)}
                      title={video.title}
                      className="reel-video-frame"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : (
                    <button
                      className="reel-media-button"
                      onClick={() => setActiveVideoId(video.id)}
                      aria-label={`Play ${video.title}`}
                    >
                      <div className="reel-play-overlay">
                        <span className="video-play-badge" aria-hidden="true">
                          ▶
                        </span>
                      </div>
                    </button>
                  )}

                  <div className="reel-gradient" />

                  <div className="reel-meta">
                    <div className="reel-source-row">
                      <SourceBadge sourceName={video.creator} />
                      <span className="reel-creator">{video.creator}</span>
                    </div>
                    <h2 className="reel-title">{video.title}</h2>
                    {video.publishedAt ? (
                      <span className="reel-date">
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(video.publishedAt))}
                      </span>
                    ) : null}
                  </div>

                  <div className="reel-actions">
                    <button
                      className={`reel-action-button ${
                        video.liked ? "reel-action-button-active" : ""
                      }`}
                      onClick={() => handleToggleLike(video.id)}
                      aria-label={video.liked ? "Unlike video" : "Like video"}
                    >
                      <span className="reel-action-icon icon-action-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path
                            d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                            fill={video.liked ? "currentColor" : "none"}
                          />
                        </svg>
                      </span>
                      <span className="reel-action-value">{video.likes}</span>
                    </button>
                    <button
                      className="reel-action-button"
                      onClick={() => setActiveCommentsVideoId(video.id)}
                      aria-label="Open video comments"
                    >
                      <span className="reel-action-icon icon-action-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                        </svg>
                      </span>
                      <span className="reel-action-value">{video.comments}</span>
                    </button>
                    <button
                      className={`reel-action-button ${
                        video.saved ? "reel-action-button-active" : ""
                      }`}
                      onClick={() => handleToggleSave(video.id)}
                      aria-label={video.saved ? "Remove bookmark" : "Save video"}
                    >
                      <span className="reel-action-icon icon-action-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path
                            d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                            fill={video.saved ? "currentColor" : "none"}
                          />
                        </svg>
                      </span>
                    </button>
                    <div className="reel-share-wrap">
                      <ShareButton
                        path={`/videos#video-${video.id}`}
                        title={video.title}
                        url={
                          video.watchUrl ||
                          `https://my-news-app-omega-orpin.vercel.app/videos#video-${video.id}`
                        }
                        iconOnly
                      />
                    </div>
                  </div>

                  {video.fallback ? (
                    <span className="reel-fallback-pill">Placeholder video</span>
                  ) : null}
                </div>
              </article>
            );
          })}
      </div>

      {activeCommentsVideo ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-comments-title"
        >
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="video-comments-title" className="modal-title">
                  Video comments
                </h3>
                <p className="muted bottom-sheet-title">{activeCommentsVideo.title}</p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setActiveCommentsVideoId(null)}
              >
                Close
              </button>
            </div>

            <div className="empty-state">
              <strong>Placeholder discussion</strong>
              <span>
                This feed uses real YouTube news videos. For now, comments remain
                a lightweight placeholder instead of syncing YouTube comment threads.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeVideo ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-player-title"
        >
          <div className="modal-card video-modal-card">
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="video-player-title" className="modal-title">
                  {activeVideo.title}
                </h3>
                <p className="muted bottom-sheet-title">{activeVideo.creator}</p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setActiveVideoId(null)}
              >
                Close
              </button>
            </div>

            {activeVideo.embedUrl ? (
              <div className="video-player-shell">
                <iframe
                  src={buildVideoEmbedUrl(activeVideo.youtubeId, true)}
                  title={activeVideo.title}
                  className="video-player-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="empty-state">
                <strong>Placeholder video</strong>
                <span>
                  Add `NEXT_PUBLIC_YOUTUBE_API_KEY` to `.env.local` to load real
                  YouTube embeds.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
