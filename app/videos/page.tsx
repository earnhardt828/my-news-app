"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanVideoTitle(title: string | null | undefined) {
  const fallbackTitle = "Latest news update";

  if (!title) {
    return fallbackTitle;
  }

  const decodedTitle = decodeHtmlEntities(title);
  const normalizedWhitespace = decodedTitle.replace(/\s+/g, " ").trim();
  const apostropheFixedTitle = normalizedWhitespace
    .replace(/(\w)\s*39\s*(\w)/g, "$1'$2")
    .replace(/\b39(?=s\b)/gi, "'")
    .replace(/\b39\b/g, " ");
  const cleanedTitle = apostropheFixedTitle
    .replace(/\s{2,}/g, " ")
    .replace(/^[\W_]+|[\W_]+$/g, "")
    .trim();

  if (cleanedTitle.length < 6 || !/[A-Za-z]/.test(cleanedTitle)) {
    return fallbackTitle;
  }

  return cleanedTitle;
}

function buildEmbedUrl(youtubeId: string, autoplay: boolean) {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${youtubeId}`);
  url.searchParams.set("autoplay", autoplay ? "1" : "0");
  url.searchParams.set("mute", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("controls", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("modestbranding", "1");
  return url.toString();
}

export default function VideosPage() {
  const [videos, setVideos] = useState(initialVideos);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [autoplayVideoId, setAutoplayVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const videoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
          title: cleanVideoTitle(video.title),
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

        setAutoplayVideoId(highestRatio >= 0.6 ? nextAutoplayId : null);
      },
      {
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: "0px 0px -12% 0px",
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
          {videos.map((video) => {
            const isAutoplaying = autoplayVideoId === video.id && !video.fallback;

            return (
              <article key={video.id} id={`video-${video.id}`} className="video-card">
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

                  <div
                    ref={(node) => {
                      videoFrameRefs.current[video.id] = node;
                    }}
                    data-video-id={video.id}
                    className={`video-frame ${video.theme ?? "video-card-theme-rose"} ${
                      isAutoplaying ? "video-frame-live" : ""
                    }`}
                  >
                    {isAutoplaying ? (
                      <iframe
                        src={buildEmbedUrl(video.youtubeId, true)}
                        title={video.title}
                        className="video-player-frame"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <button
                        className="video-frame-button"
                        onClick={() => setActiveVideoId(video.id)}
                        aria-label={`Play ${video.title}`}
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
                            {video.fallback ? "Placeholder video" : "Tap to play"}
                          </span>
                        </div>
                      </button>
                    )}
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
                      url={
                        video.watchUrl ||
                        `https://my-news-app-omega-orpin.vercel.app/videos#video-${video.id}`
                      }
                    />
                  </div>
                </div>
              </article>
            );
          })}
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
                  src={buildEmbedUrl(activeVideo.youtubeId, true)}
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
