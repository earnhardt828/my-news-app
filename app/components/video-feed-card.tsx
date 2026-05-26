"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ShareButton from "./share-button";
import SourceBadge from "./source-badge";
import { formatRelativeTimestamp } from "../../lib/relative-time";
import {
  buildVideoEmbedUrl,
  formatVideoPublishedDate,
  inferVideoOrientation,
  type VideoItem,
} from "../../lib/video-feed";

type VideoFeedCardProps = {
  video: VideoItem;
  isAutoplaying?: boolean;
  onToggleLike: (videoId: string) => void;
  onToggleSave: (videoId: string) => void;
  onOpenComments: (videoId: string) => void;
  onOpenPlayer: (videoId: string) => void;
  frameRef?: (node: HTMLDivElement | null) => void;
  label?: string;
  rankBadgeLabel?: string | null;
  className?: string;
  variant?: "default" | "article";
  autoplayKey?: string;
  previewDurationMs?: number | null;
  hideActions?: boolean;
  useRelativeTime?: boolean;
  useUniformTallFrame?: boolean;
};

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

export default function VideoFeedCard({
  video,
  isAutoplaying = false,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenPlayer,
  frameRef,
  label,
  rankBadgeLabel = null,
  className = "",
  variant = "default",
  autoplayKey,
  previewDurationMs = null,
  hideActions = false,
  useRelativeTime = false,
  useUniformTallFrame = false,
}: VideoFeedCardProps) {
  const isArticleVariant = variant === "article";
  const defaultTrendingOrientation = inferVideoOrientation(undefined, undefined, {
    title: video.title,
    watchUrl: video.watchUrl,
    thumbnailUrl: video.thumbnailUrl,
  });
  const baseOrientation =
    defaultTrendingOrientation === "vertical" ? "vertical" : video.orientation;
  const [probedOrientation, setProbedOrientation] = useState<{
    thumbnailUrl: string | null;
    value: "vertical" | "horizontal" | null;
  }>({
    thumbnailUrl: video.thumbnailUrl,
    value: null,
  });
  const [isPreviewActive, setIsPreviewActive] = useState(true);

  useEffect(() => {
    if (!previewDurationMs) {
      return;
    }

    if (!isAutoplaying) {
      const resetTimeoutId = window.setTimeout(() => {
        setIsPreviewActive(true);
      }, 0);

      return () => {
        window.clearTimeout(resetTimeoutId);
      };
    }

    const startTimeoutId = window.setTimeout(() => {
      setIsPreviewActive(true);
    }, 0);
    const stopTimeoutId = window.setTimeout(() => {
      setIsPreviewActive(false);
    }, previewDurationMs);

    return () => {
      window.clearTimeout(startTimeoutId);
      window.clearTimeout(stopTimeoutId);
    };
  }, [isAutoplaying, previewDurationMs]);

  useEffect(() => {
    if (
      !isArticleVariant ||
      video.fallback ||
      !video.thumbnailUrl ||
      typeof window === "undefined"
    ) {
      return;
    }

    const probeImage = new window.Image();

    probeImage.onload = () => {
      if (defaultTrendingOrientation === "vertical") {
        setProbedOrientation({
          thumbnailUrl: video.thumbnailUrl,
          value: "vertical",
        });
        return;
      }

      if (probeImage.naturalHeight > probeImage.naturalWidth) {
        setProbedOrientation({
          thumbnailUrl: video.thumbnailUrl,
          value: "vertical",
        });
        return;
      }

      setProbedOrientation({
        thumbnailUrl: video.thumbnailUrl,
        value: "horizontal",
      });
    };

    probeImage.onerror = () => {
      setProbedOrientation({
        thumbnailUrl: video.thumbnailUrl,
        value: null,
      });
    };

    probeImage.src = video.thumbnailUrl;

    return () => {
      probeImage.onload = null;
      probeImage.onerror = null;
    };
  }, [
    defaultTrendingOrientation,
    isArticleVariant,
    video.fallback,
    video.orientation,
    video.thumbnailUrl,
  ]);
  const resolvedOrientation =
    probedOrientation.thumbnailUrl === video.thumbnailUrl && probedOrientation.value
      ? probedOrientation.value
      : baseOrientation;

  useEffect(() => {
    if (isAutoplaying && autoplayKey?.includes("sports")) {
      console.log("SPORTS VIDEO AUTOPLAY ATTEMPT", autoplayKey, video.id);
    }

    if (isAutoplaying && autoplayKey?.includes("sports-more-quickwatch")) {
      console.log("MORE VIDEOS AUTOPLAY ATTEMPT", autoplayKey, video.id);
    }

    if (isAutoplaying && autoplayKey?.includes("weather-videos")) {
      console.log("WEATHER VIDEOS AUTOPLAY ATTEMPT", autoplayKey, video.id);
    }
  }, [autoplayKey, isAutoplaying, video.id]);

  const articleFrameClass =
    resolvedOrientation === "vertical"
      ? "video-frame-article-vertical"
      : "video-frame-article-horizontal";
  const articleOrientationClass =
    resolvedOrientation === "vertical"
      ? "video-card-article-vertical"
      : "video-card-article-horizontal";
  const shouldAutoplayFrame = isAutoplaying && (!previewDurationMs || isPreviewActive);
  const publishedLabel = useRelativeTime
    ? formatRelativeTimestamp(video.publishedAt)
    : formatVideoPublishedDate(video.publishedAt);
  let previewEmbedUrl: string | null = null;

  try {
    previewEmbedUrl = buildVideoEmbedUrl(video.youtubeId, true, { startSeconds: 5 });
  } catch (error) {
    console.error("VIDEO RENDER ERROR", {
      videoId: video.id,
      title: video.title,
      error,
    });
    previewEmbedUrl = null;
  }

  if (isArticleVariant) {
    return (
      <article
        id={`video-${video.id}`}
        className={`video-card video-card-article ${
          rankBadgeLabel ? "news-card-has-rank" : ""
        } ${articleOrientationClass} ${useUniformTallFrame ? "video-card-article-uniform-tall" : ""} ${className}`.trim()}
      >
        {rankBadgeLabel ? (
          <span className="chip trending-rank-badge news-card-rank-badge">
            {rankBadgeLabel}
          </span>
        ) : null}
        <div className="trending-source-row video-card-article-source-row">
          <div className="trending-source-brand">
            <SourceBadge sourceName={video.creator} />
            <span className="trending-source-name">{video.creator}</span>
          </div>
        </div>

        <div className="trending-meta-row">
          <span className="trending-published-date">{publishedLabel}</span>
        </div>

        <div
          ref={frameRef}
          data-video-key={autoplayKey ?? video.id}
          data-video-id={video.id}
          className={`video-frame video-frame-article ${articleFrameClass} ${
            video.theme ?? "video-card-theme-rose"
          }`}
        >
          {shouldAutoplayFrame && !video.fallback && previewEmbedUrl ? (
            <>
              <iframe
                src={previewEmbedUrl}
                title={video.title}
                className="video-player-frame"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              <button
                type="button"
                className="video-frame-hitbox"
                onClick={() => onOpenPlayer(video.id)}
                aria-label={`Open ${video.title}`}
              />
              <div className="video-card-title-overlay" aria-hidden="true">
                <h3 className="video-card-title-overlay-text">{video.title}</h3>
              </div>
            </>
          ) : (
            <button
              className="video-frame-button"
              onClick={() => onOpenPlayer(video.id)}
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
              </div>
              <div className="video-card-title-overlay">
                <h3 className="video-card-title-overlay-text">{video.title}</h3>
              </div>
              {!video.thumbnailUrl ? (
                <div className="video-frame-fallback-copy">
                  <h3 className="video-card-title-overlay-text">{video.title}</h3>
                </div>
              ) : null}
            </button>
          )}
        </div>

        {hideActions ? null : (
          <div className="engagement-row trending-stats-row">
            <button
              className={`icon-action-pill ${video.liked ? "icon-action-pill-active" : ""}`}
              onClick={() => onToggleLike(video.id)}
              aria-label={video.liked ? "Unlike video" : "Like video"}
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg {...actionIconProps}>
                  <path
                    d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                    fill={video.liked ? "currentColor" : "none"}
                  />
                </svg>
              </span>
              <span>{video.likes}</span>
            </button>
            <button
              className="icon-action-pill"
              onClick={() => onOpenComments(video.id)}
              aria-label="Open video comments"
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg {...actionIconProps}>
                  <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                </svg>
              </span>
              <span>{video.comments}</span>
            </button>
            <ShareButton
              path={`/videos#video-${video.id}`}
              title={video.title}
              url={
                video.watchUrl ||
                `https://my-news-app-omega-orpin.vercel.app/videos#video-${video.id}`
              }
              iconOnly
              className="share-trigger-button-inline"
            />
            <button
              className={`bookmark-button ${video.saved ? "bookmark-button-active" : ""}`}
              onClick={() => onToggleSave(video.id)}
              aria-label={video.saved ? "Remove bookmark" : "Save video"}
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg {...actionIconProps}>
                  <path
                    d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                    fill={video.saved ? "currentColor" : "none"}
                  />
                </svg>
              </span>
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <article id={`video-${video.id}`} className={`video-card ${className}`.trim()}>
      <div className="stack" style={{ gap: "10px" }}>
        <div className="video-meta-row">
          <div className="stack" style={{ gap: "4px" }}>
            {label ? <span className="chip video-chip">{label}</span> : null}
            <h3 className="video-title">{video.title}</h3>
            <span className="video-creator">{video.creator}</span>
            <span className="video-date">
              Published {formatVideoPublishedDate(video.publishedAt)}
            </span>
          </div>
        </div>

        <div
          ref={frameRef}
          data-video-id={video.id}
          className={`video-frame ${video.theme ?? "video-card-theme-rose"} ${
            isAutoplaying ? "video-frame-live" : ""
          }`}
        >
          {isAutoplaying && !video.fallback && previewEmbedUrl ? (
            <iframe
              src={previewEmbedUrl}
              title={video.title}
              className="video-player-frame"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <button
              className="video-frame-button"
              onClick={() => onOpenPlayer(video.id)}
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
            className={`icon-action-pill ${video.liked ? "icon-action-pill-active" : ""}`}
            onClick={() => onToggleLike(video.id)}
            aria-label={video.liked ? "Unlike video" : "Like video"}
          >
            <span aria-hidden="true">{video.liked ? "♥" : "♡"}</span>
            <span>{video.likes}</span>
          </button>
          <button
            className="icon-action-pill"
            onClick={() => onOpenComments(video.id)}
            aria-label="Open video comments"
          >
            <span aria-hidden="true">💬</span>
            <span>{video.comments}</span>
          </button>
          <button
            className={`bookmark-button ${video.saved ? "bookmark-button-active" : ""}`}
            onClick={() => onToggleSave(video.id)}
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
}
