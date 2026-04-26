"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ShareButton from "../components/share-button";

type VideoItem = {
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
  likes: number;
  comments: number;
  saved: boolean;
  liked: boolean;
  theme: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  watchUrl: string;
  embedUrl: string;
  fallback: boolean;
};

const initialVideos: VideoItem[] = [
  {
    id: "fallback-1",
    youtubeId: "fallback-1",
    title: "Morning markets in 60 seconds",
    creator: "Mirur Business",
    likes: 248,
    comments: 36,
    saved: false,
    liked: false,
    theme: "video-card-theme-rose",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
  {
    id: "fallback-2",
    youtubeId: "fallback-2",
    title: "Tech launch recap from today",
    creator: "Mirur Tech",
    likes: 391,
    comments: 51,
    saved: true,
    liked: true,
    theme: "video-card-theme-ink",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
  {
    id: "fallback-3",
    youtubeId: "fallback-3",
    title: "World headlines quick rundown",
    creator: "Mirur World",
    likes: 172,
    comments: 19,
    saved: false,
    liked: false,
    theme: "video-card-theme-sunset",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
];

function formatPublishedDate(publishedAt: string | null) {
  if (!publishedAt) {
    return "Recent";
  }

  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function VideosPage() {
  const [videos, setVideos] = useState(initialVideos);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function loadVideos() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/videos");
        const data = (await response.json()) as {
          videos?: Array<
            Omit<VideoItem, "saved" | "liked" | "theme"> & {
              saved?: boolean;
              liked?: boolean;
              theme?: string | null;
            }
          >;
          fallback?: boolean;
          message?: string;
        };

        const themes = [
          "video-card-theme-rose",
          "video-card-theme-ink",
          "video-card-theme-sunset",
        ];

        const nextVideos = (data.videos ?? initialVideos).map((video, index) => ({
          ...video,
          saved: video.saved ?? false,
          liked: video.liked ?? false,
          theme: video.theme ?? themes[index % themes.length],
        }));

        setVideos(nextVideos);
        setStatusMessage(data.fallback ? data.message ?? "" : "");
      } catch (error) {
        console.error("Error loading video feed:", error);
        setVideos(initialVideos);
        setStatusMessage(
          "Could not load YouTube news videos, so placeholder videos are shown."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadVideos();
  }, []);

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
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId
          ? {
              ...video,
              liked: !video.liked,
              likes: video.liked ? Math.max(0, video.likes - 1) : video.likes + 1,
            }
          : video
      )
    );
  };

  const handleToggleSave = (videoId: string) => {
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      )
    );
  };

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Videos</p>
        <h2 className="page-title">Vertical updates made for quick scrolls.</h2>
        <p className="page-subtitle">
          Recent clips from curated official YouTube news channels, optimized
          for a mobile-first feed.
        </p>
      </div>

      {statusMessage ? <div className="chip chip-accent">{statusMessage}</div> : null}

      {isLoading ? (
        <div className="stack">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="skeleton-card">
              <div className="video-frame video-card-theme-rose" />
              <div className="stack" style={{ gap: "8px" }}>
                <div className="skeleton-line skeleton-title-lg skeleton-body-lg" />
                <div className="skeleton-line skeleton-body-md" />
                <div className="skeleton-action-row">
                  <div className="skeleton-line skeleton-stat" />
                  <div className="skeleton-line skeleton-stat" />
                  <div className="skeleton-line skeleton-button" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="video-feed">
        {videos.map((video) => (
          <article key={video.id} id={`video-${video.id}`} className="video-card">
            <button
              className={`video-frame ${video.theme ?? "video-card-theme-rose"}`}
              onClick={() => setActiveVideoId(video.id)}
            >
              {video.thumbnailUrl ? (
                <Image
                  src={video.thumbnailUrl}
                  alt={video.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 420px"
                  className="video-thumbnail"
                  unoptimized
                />
              ) : null}
              <div className="video-frame-overlay">
                <span className="video-play-badge" aria-hidden="true">
                  ▶
                </span>
                <span className="video-live-pill">
                  {video.fallback ? "Placeholder video" : "Watch video"}
                </span>
              </div>
            </button>

            <div className="stack" style={{ gap: "10px" }}>
              <div className="video-meta-row">
                <div className="stack" style={{ gap: "4px" }}>
                  <h3 className="video-title">{video.title}</h3>
                  <span className="video-creator">{video.creator}</span>
                  <span className="video-date">
                    Published {formatPublishedDate(video.publishedAt)}
                  </span>
                </div>
              </div>

              <div className="engagement-row">
                <button
                  className={`icon-action-pill ${
                    video.liked ? "icon-action-pill-active" : ""
                  }`}
                  onClick={() => handleToggleLike(video.id)}
                  aria-label={video.liked ? "Unlike video" : "Like video"}
                >
                  <span aria-hidden="true">{video.liked ? "♥" : "♡"}</span>
                  <span>{video.likes}</span>
                </button>
                <button
                  className="icon-action-pill"
                  onClick={() => setActiveCommentsVideoId(video.id)}
                  aria-label="Open video comments"
                >
                  <span aria-hidden="true">💬</span>
                  <span>{video.comments}</span>
                </button>
                <button
                  className={`bookmark-button ${video.saved ? "bookmark-button-active" : ""}`}
                  onClick={() => handleToggleSave(video.id)}
                  aria-label={video.saved ? "Remove bookmark" : "Save video"}
                >
                  {video.saved ? "🔖" : "📑"}
                </button>
              </div>

              <div className="trending-card-actions">
                <ShareButton
                  path={`/videos#video-${video.id}`}
                  title={video.title}
                  url={video.watchUrl || `https://my-news-app-omega-orpin.vercel.app/videos#video-${video.id}`}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
      )}

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
                  src={activeVideo.embedUrl}
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
