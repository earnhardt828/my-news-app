"use client";

import VideoFeedCard from "./video-feed-card";
import type { VideoItem } from "../../lib/video-feed";

type CategoryVideoRowProps = {
  category: string;
  videos: VideoItem[];
  videoStatus?: { loading: boolean; error: boolean };
  activeTechnologyVideoKey: string | null;
  autoplayTrendingVideoKeys: string[];
  onToggleLike: (videoId: string) => void;
  onToggleSave: (videoId: string) => void;
  onOpenComments: (videoId: string) => void;
  onOpenPlayer: (videoId: string, category: string) => void;
  setFrameRef: (key: string, node: HTMLDivElement | null) => void;
};

export default function CategoryVideoRow({
  category,
  videos,
  videoStatus = { loading: false, error: false },
  activeTechnologyVideoKey,
  autoplayTrendingVideoKeys,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenPlayer,
  setFrameRef,
}: CategoryVideoRowProps) {
  const isMlbRow = category === "MLB";
  const isSportsRow = category === "Sports";
  const isTechnologyRow = category === "Tech";
  const isPoliticsRow = category === "Politics";
  const isWorldRow = category === "World";

  if (!isTechnologyRow && !isPoliticsRow && !isWorldRow && videos.length === 0) {
    return null;
  }

  const label = `${category} Videos`;
  const normalizedCategoryKey = category.toLowerCase().replace(/\s+/g, "-");

  return (
    <section className="home-section-block home-section-plain quick-watch-row mynews-category-videos-row">
      <div className="home-section-header">
        <div className="stack" style={{ gap: "4px" }}>
          <strong className="profile-section-title home-section-title">{label}</strong>
        </div>
      </div>
      {isTechnologyRow && videos.length === 0 ? (
        <div className="empty-state compact-empty-state" style={{ marginBottom: "12px" }}>
          <strong>No technology videos available right now.</strong>
        </div>
      ) : null}
      {isPoliticsRow && videos.length === 0 ? (
        <div className="empty-state compact-empty-state" style={{ marginBottom: "12px" }}>
          <strong>
            {videoStatus.loading
              ? "Loading politics videos..."
              : videoStatus.error
                ? "Could not load politics videos right now."
                : "No politics videos available right now."}
          </strong>
        </div>
      ) : null}
      {isWorldRow && videos.length === 0 ? (
        <div className="empty-state compact-empty-state" style={{ marginBottom: "12px" }}>
          <strong>
            {videoStatus.loading ? "Loading world videos..." : "No world videos available right now."}
          </strong>
        </div>
      ) : null}
      <div className="quick-watch-scroll" role="list" aria-label={label}>
        {videos.map((video) => {
          const autoplayKey = `mynews-category-${normalizedCategoryKey}:${video.id}`;

          return (
            <div
              key={`mynews-category-video-${normalizedCategoryKey}-${video.id}`}
              className="quick-watch-item"
              role="listitem"
            >
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  (isTechnologyRow
                    ? activeTechnologyVideoKey === autoplayKey
                    : autoplayTrendingVideoKeys.includes(autoplayKey)) && !video.fallback
                }
                onToggleLike={onToggleLike}
                onToggleSave={onToggleSave}
                onOpenComments={onOpenComments}
                onOpenPlayer={(videoId) => onOpenPlayer(videoId, category)}
                frameRef={(node) => {
                  setFrameRef(autoplayKey, node);
                }}
                autoplayKey={autoplayKey}
                previewDurationMs={null}
                label={label}
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card"
                variant="article"
                useUniformTallFrame={isMlbRow}
                useUniformWideFrame={isTechnologyRow || isSportsRow}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
