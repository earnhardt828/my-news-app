"use client";

import Image from "next/image";
import ShareButton from "./share-button";
import {
  buildVideoEmbedUrl,
  formatVideoPublishedDate,
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
  className?: string;
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
  className = "",
}: VideoFeedCardProps) {
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
          {isAutoplaying && !video.fallback ? (
            <iframe
              src={buildVideoEmbedUrl(video.youtubeId, true)}
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
