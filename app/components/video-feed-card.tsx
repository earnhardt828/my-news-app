"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import HeartIcon from "./heart-icon";
import ShareButton from "./share-button";
import SourceBadge from "./source-badge";
import { isNativeCapacitorRuntime } from "../../lib/api-base";
import { openOriginalArticleUrl } from "../../lib/open-article";
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
  useUniformWideFrame?: boolean;
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
  useUniformWideFrame = false,
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
  const [previewEmbedLoaded, setPreviewEmbedLoaded] = useState(false);
  const [previewEmbedFailed, setPreviewEmbedFailed] = useState(false);

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

  useEffect(() => {
    setPreviewEmbedLoaded(false);
    setPreviewEmbedFailed(false);
  }, [video.id, isAutoplaying, previewDurationMs]);

  useEffect(() => {
    if (
      !isAutoplaying ||
      !isPreviewActive ||
      video.fallback ||
      !video.youtubeId
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPreviewEmbedFailed(true);
    }, 4500);

    if (previewEmbedLoaded) {
      window.clearTimeout(timeoutId);
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAutoplaying,
    isPreviewActive,
    previewEmbedLoaded,
    video.fallback,
    video.youtubeId,
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

    if (isAutoplaying && autoplayKey?.includes("featured-videos")) {
      console.log("SOURCE RANKINGS FEATURED VIDEOS AUTOPLAY ATTEMPT", autoplayKey, video.id);
    }

    if (isAutoplaying && autoplayKey?.includes("featured-videos-above-weather")) {
      console.log("FEATURED VIDEOS ABOVE WEATHER AUTOPLAY ATTEMPT", autoplayKey, video.id);
    }

    if (isAutoplaying && autoplayKey?.includes("mynews-category-tech")) {
      console.log("MY NEWS TECH VIDEO AUTOPLAY ATTEMPT", autoplayKey, video.id);
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
  const shouldAutoplayFrame =
    isAutoplaying && (!previewDurationMs || isPreviewActive) && !previewEmbedFailed;
  const publishedLabel = useRelativeTime
    ? formatRelativeTimestamp(video.publishedAt)
    : formatVideoPublishedDate(video.publishedAt);
  const shouldShowTopRightTimePill = isArticleVariant && Boolean(publishedLabel);
  const shouldUseExternalPlayback = isNativeCapacitorRuntime();
  if (shouldShowTopRightTimePill) {
    console.log("TRENDING_VIDEO_TIME_TOP_RIGHT", {
      videoId: video.id,
      title: video.title,
      publishedLabel,
    });
  }
  if (isArticleVariant) {
    console.log("TRENDING_VIDEO_SOURCE_TOP", {
      videoId: video.id,
      creator: video.creator,
    });
  }
  const handleOpenVideo = () => {
    if (shouldUseExternalPlayback && video.watchUrl) {
      void openOriginalArticleUrl(video.watchUrl);
      return;
    }

    if (video.fallback && video.watchUrl && typeof window !== "undefined") {
      void openOriginalArticleUrl(video.watchUrl);
      return;
    }

    onOpenPlayer(video.id);
  };
  let previewEmbedUrl: string | null = null;

  try {
    previewEmbedUrl = buildVideoEmbedUrl(video.youtubeId, true, { startSeconds: 5 });
    if (previewEmbedUrl) {
      console.log("YOUTUBE_START_AT_5_SECONDS", {
        videoId: video.id,
        youtubeId: video.youtubeId,
      });
    }
  } catch (error) {
    console.error("VIDEO RENDER ERROR", {
      videoId: video.id,
      title: video.title,
      error,
    });
    previewEmbedUrl = null;
  }

  if (isArticleVariant) {
    console.log("TRENDING_VIDEO_CUSTOM_CARD_USED", {
      videoId: video.id,
      title: video.title,
      creator: video.creator,
    });

    return (
      <article
        id={`video-${video.id}`}
        className={`video-card video-card-article ${
          rankBadgeLabel ? "news-card-has-rank" : ""
        } ${articleOrientationClass} ${
          useUniformTallFrame ? "video-card-article-uniform-tall" : ""
        } ${useUniformWideFrame ? "video-card-article-uniform-wide" : ""} ${className}`.trim()}
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
        <div
          ref={frameRef}
          data-video-key={autoplayKey ?? video.id}
          data-video-id={video.id}
          className={`video-frame video-frame-article ${articleFrameClass} ${
            video.theme ?? "video-card-theme-rose"
          }`}
        >
          {shouldAutoplayFrame && !shouldUseExternalPlayback && !video.fallback && previewEmbedUrl ? (
            <>
              {console.log("TRENDING_VIDEO_AUTOPLAY_ENABLED", {
                videoId: video.id,
                title: video.title,
              })}
              <iframe
                src={previewEmbedUrl}
                title={video.title}
                className="video-player-frame"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => setPreviewEmbedLoaded(true)}
                onError={() => setPreviewEmbedFailed(true)}
              />
              <button
                type="button"
                className="video-frame-hitbox"
                onClick={handleOpenVideo}
                aria-label={`Open ${video.title}`}
              />
              {shouldShowTopRightTimePill ? (
                <span className="video-time-pill video-time-pill-top-right">{publishedLabel}</span>
              ) : null}
              <div className="video-card-title-overlay" aria-hidden="true">
                <h3 className="video-card-title-overlay-text">{video.title}</h3>
              </div>
            </>
          ) : (
            <button
              className="video-frame-button"
              onClick={handleOpenVideo}
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
              {shouldShowTopRightTimePill ? (
                <span className="video-time-pill video-time-pill-top-right">{publishedLabel}</span>
              ) : null}
              <div className="video-frame-overlay">
                <span className="video-play-badge" aria-hidden="true" />
              </div>
              <div className="video-card-title-overlay">
                <h3 className="video-card-title-overlay-text">{video.title}</h3>
                {shouldUseExternalPlayback ? (
                  <span className="chip chip-accent" style={{ marginTop: "8px" }}>
                    Watch Video
                  </span>
                ) : null}
              </div>
              {!video.thumbnailUrl || previewEmbedFailed ? (
                <div className="video-frame-fallback-copy">
                  <h3 className="video-card-title-overlay-text">{video.title}</h3>
                  {video.watchUrl ? (
                    <span className="chip chip-accent" style={{ marginTop: "8px" }}>
                      Watch Video
                    </span>
                  ) : null}
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
                <HeartIcon filled={video.liked} size={20} strokeWidth={1.9} />
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
          {shouldAutoplayFrame && !shouldUseExternalPlayback && !video.fallback && previewEmbedUrl ? (
            <iframe
              src={previewEmbedUrl}
              title={video.title}
              className="video-player-frame"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setPreviewEmbedLoaded(true)}
              onError={() => setPreviewEmbedFailed(true)}
            />
          ) : (
            <button
              className="video-frame-button"
              onClick={handleOpenVideo}
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
                <span className="video-play-badge" aria-hidden="true" />
                <span className="video-live-pill">
                  {shouldUseExternalPlayback
                    ? "Watch Video"
                    : video.fallback
                      ? "Placeholder video"
                      : "Tap to play"}
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
            <span className="icon-action-glyph" aria-hidden="true">
              <HeartIcon filled={video.liked} size={18} strokeWidth={1.9} />
            </span>
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
