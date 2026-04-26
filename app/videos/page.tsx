"use client";

import { useMemo, useState } from "react";
import ShareButton from "../components/share-button";

type VideoItem = {
  id: number;
  title: string;
  creator: string;
  likes: number;
  comments: number;
  saved: boolean;
  liked: boolean;
  theme: string;
};

const initialVideos: VideoItem[] = [
  {
    id: 1,
    title: "Morning markets in 60 seconds",
    creator: "Mirur Business",
    likes: 248,
    comments: 36,
    saved: false,
    liked: false,
    theme: "video-card-theme-rose",
  },
  {
    id: 2,
    title: "Tech launch recap from today",
    creator: "Mirur Tech",
    likes: 391,
    comments: 51,
    saved: true,
    liked: true,
    theme: "video-card-theme-ink",
  },
  {
    id: 3,
    title: "World headlines quick rundown",
    creator: "Mirur World",
    likes: 172,
    comments: 19,
    saved: false,
    liked: false,
    theme: "video-card-theme-sunset",
  },
];

export default function VideosPage() {
  const [videos, setVideos] = useState(initialVideos);
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<number | null>(
    null
  );

  const activeVideo = useMemo(
    () => videos.find((video) => video.id === activeCommentsVideoId) ?? null,
    [activeCommentsVideoId, videos]
  );

  const handleToggleLike = (videoId: number) => {
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

  const handleToggleSave = (videoId: number) => {
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
          A dedicated short-form video feed keeps Trending focused on articles
          while you explore mobile-first visual updates.
        </p>
      </div>

      <div className="video-feed">
        {videos.map((video) => (
          <article key={video.id} className="video-card">
            <div className={`video-frame ${video.theme}`}>
              <div className="video-frame-overlay">
                <span className="video-play-badge" aria-hidden="true">
                  ▶
                </span>
                <span className="video-live-pill">Placeholder video</span>
              </div>
            </div>

            <div className="stack" style={{ gap: "10px" }}>
              <div className="video-meta-row">
                <div className="stack" style={{ gap: "4px" }}>
                  <h3 className="video-title">{video.title}</h3>
                  <span className="video-creator">{video.creator}</span>
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
                  path="/videos"
                  title={video.title}
                  url={`https://my-news-app-omega-orpin.vercel.app/videos#video-${video.id}`}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      {activeVideo ? (
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
                <p className="muted bottom-sheet-title">{activeVideo.title}</p>
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
                Video comments can plug into the same mobile bottom-sheet pattern
                when you connect a real backend source.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
