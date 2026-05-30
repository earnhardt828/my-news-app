"use client";

import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api-base";
import ShareButton from "../components/share-button";
import SourceBadge from "../components/source-badge";
import {
  readVideoReturnState,
  savePendingVideoReturnState,
  SHARED_VIDEO_CATEGORIES,
  type SharedVideoTab,
  type VideoReturnState,
} from "../../lib/video-navigation";
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

function isStrictTechnologyVideo(video: Pick<VideoItem, "title" | "creator" | "category" | "watchUrl" | "thumbnailUrl">) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl} ${
    video.thumbnailUrl ?? ""
  }`.toLowerCase();

  const hasStrongTechContext =
    /\b(technology|tech|ai|artificial intelligence|apple|google|microsoft|openai|nvidia|cybersecurity|software|startup|gadgets?|iphone|semiconductor|chip|robot|app|device)\b/.test(
      haystack
    );
  const hasRejectedContext =
    /\b(politics?|crime|sports?|nfl|nba|nhl|mlb|mls|celebrity|hollywood|weather|forecast|storm|war|court|election|local news|world news)\b/.test(
      haystack
    );

  if (hasRejectedContext && !hasStrongTechContext) {
    return false;
  }

  return hasStrongTechContext;
}

function isStrictPoliticsVideo(
  video: Pick<VideoItem, "title" | "creator" | "category" | "watchUrl" | "thumbnailUrl">
) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl} ${
    video.thumbnailUrl ?? ""
  }`.toLowerCase();

  const hasPoliticsContext =
    /\b(politics?|political|white house|congress|senate|house|supreme court|election|campaign|president|governor|mayor|policy|government|politico|ap politics|reuters politics|cnn politics|fox news politics|nbc politics|abc politics|cbs politics)\b/.test(
      haystack
    );
  const hasRejectedContext =
    /\b(sports?|nfl|nba|nhl|mlb|mls|celebrity|hollywood|food|recipe|travel|weather|forecast|storm|technology|tech|ai|software|crime)\b/.test(
      haystack
    );

  if (hasRejectedContext && !hasPoliticsContext) {
    return false;
  }

  return hasPoliticsContext;
}

type VideoTab = SharedVideoTab;

export default function VideosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<VideoTab>("news");
  const [videosByTab, setVideosByTab] = useState<Record<VideoTab, VideoItem[]>>({
    news: initialVideos,
    politics: [],
    sports: [],
    celebrity: [],
    technology: [],
  });
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [autoplayVideoId, setAutoplayVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [tabLoading, setTabLoading] = useState<Record<VideoTab, boolean>>({
    news: true,
    politics: false,
    sports: false,
    celebrity: false,
    technology: false,
  });
  const [statusMessages, setStatusMessages] = useState<Record<VideoTab, string>>({
    news: "",
    politics: "",
    sports: "",
    celebrity: "",
    technology: "",
  });
  const videoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasLoadedOnceRef = useRef(false);
  const loadedTabsRef = useRef<Record<VideoTab, boolean>>({
    news: false,
    politics: false,
    sports: false,
    celebrity: false,
    technology: false,
  });
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const displayedVideosRaw = videosByTab[activeTab];
  const displayedVideos =
    activeTab === "technology"
      ? displayedVideosRaw.filter((video) => isStrictTechnologyVideo(video))
      : activeTab === "politics"
        ? displayedVideosRaw.filter((video) => isStrictPoliticsVideo(video))
      : displayedVideosRaw;
  const statusMessage = statusMessages[activeTab];
  const isCurrentTabLoading = tabLoading[activeTab];
  const requestedTab =
    searchParams.get("tab") === "sports"
      ? "sports"
      : searchParams.get("tab") === "politics"
        ? "politics"
      : searchParams.get("tab") === "celebrity"
        ? "celebrity"
        : searchParams.get("tab") === "technology"
          ? "technology"
        : "news";
  const requestedVideoId = searchParams.get("video");
  const [returnState, setReturnState] = useState<VideoReturnState | null>(null);

  useEffect(() => {
    console.log("VIDEO PAGE ACTIVE TABS", SHARED_VIDEO_CATEGORIES.map((tab) => tab.value));
  }, []);

  useEffect(() => {
    if (activeTab !== "technology") {
      if (activeTab !== "politics") {
        return;
      }
    }

    if (activeTab === "technology") {
      console.log("TECHNOLOGY RENDER RAW COUNT", displayedVideosRaw.length);
      console.log("TECHNOLOGY RENDER STRICT COUNT", displayedVideos.length);
      console.log("TECHNOLOGY RENDER RAW TITLES", displayedVideosRaw.map((video) => video.title));
      console.log("TECHNOLOGY RENDER FILTERED TITLES", displayedVideos.map((video) => video.title));
      console.log("TECHNOLOGY RENDER FINAL COUNT", displayedVideos.length);
      return;
    }

    console.log("POLITICS VIDEO TAB ACTIVE");
  }, [activeTab, displayedVideos, displayedVideosRaw]);

  useEffect(() => {
    setReturnState(readVideoReturnState());
  }, []);

  const loadVideosForTab = useCallback(async (tab: VideoTab, force = false) => {
    if (loadedTabsRef.current[tab] && !force) {
      return;
    }

    const shouldBlockScreen = !hasLoadedOnceRef.current && tab === "news";
    if (shouldBlockScreen) {
      setIsLoading(true);
    }

    setTabLoading((prev) => ({ ...prev, [tab]: true }));

    try {
      const response = await apiFetch(`/api/videos?tab=${tab}`);
      const data = (await response.json()) as {
        videos?: VideoApiItem[];
        fallback?: boolean;
        message?: string;
      };

      const normalizedVideos = normalizeVideoFeedItems(data.videos).filter((video) =>
        Boolean(video.youtubeId)
      );

      setVideosByTab((prev) => ({
        ...prev,
        [tab]: normalizedVideos,
      }));
      setStatusMessages((prev) => ({
        ...prev,
        [tab]: data.fallback ? data.message ?? "" : "",
      }));
      loadedTabsRef.current[tab] = true;
    } catch (error) {
        console.error(`Error loading ${tab} video feed:`, error);
      setVideosByTab((prev) => ({
        ...prev,
        [tab]: tab === "news" ? initialVideos : [],
      }));
      setStatusMessages((prev) => ({
        ...prev,
        [tab]:
          tab === "sports"
            ? "Could not load live sports videos right now."
            : tab === "politics"
              ? "Could not load live politics videos right now."
            : tab === "celebrity"
              ? "Could not load live celebrity videos right now."
              : tab === "technology"
                ? "Could not load live technology videos right now."
              : "Could not load live videos, so the current feed is shown instead.",
      }));
    } finally {
      setTabLoading((prev) => ({ ...prev, [tab]: false }));
      if (shouldBlockScreen) {
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadVideosForTab(activeTab);
  }, [activeTab, loadVideosForTab]);

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    setActiveVideoId(null);
    setActiveCommentsVideoId(null);
    setAutoplayVideoId(null);
  }, [activeTab]);

  useEffect(() => {
    const playableVideos = displayedVideos.filter(
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
  }, [displayedVideos]);

  useEffect(() => {
    if (!requestedVideoId || activeTab !== requestedTab || displayedVideos.length === 0) {
      return;
    }

    const targetVideo = displayedVideos.find((video) => video.id === requestedVideoId);
    const targetNode = targetVideo ? videoFrameRefs.current[targetVideo.id] : null;

    if (!targetVideo || !targetNode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      setAutoplayVideoId(targetVideo.id);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeTab, displayedVideos, requestedTab, requestedVideoId]);

  const activeVideo = useMemo(
    () => displayedVideos.find((video) => video.id === activeVideoId) ?? null,
    [activeVideoId, displayedVideos]
  );

  const activeCommentsVideo = useMemo(
    () =>
      activeCommentsVideoId === null
        ? null
        : displayedVideos.find((video) => video.id === activeCommentsVideoId) ?? null,
    [activeCommentsVideoId, displayedVideos]
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

    setVideosByTab((prev) => ({
      news: updateVideos(prev.news),
      politics: updateVideos(prev.politics),
      sports: updateVideos(prev.sports),
      celebrity: updateVideos(prev.celebrity),
      technology: updateVideos(prev.technology),
    }));
  };

  const handleToggleSave = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      );

    setVideosByTab((prev) => ({
      news: updateVideos(prev.news),
      politics: updateVideos(prev.politics),
      sports: updateVideos(prev.sports),
      celebrity: updateVideos(prev.celebrity),
      technology: updateVideos(prev.technology),
    }));
  };

  const handleHorizontalSwipeStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleHorizontalSwipeEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    const touch = event.changedTouches[0];

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (startX === null || startY === null) {
      return;
    }

    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;

    if (Math.abs(diffX) < 50 || Math.abs(diffX) <= Math.abs(diffY)) {
      return;
    }

    const tabs = SHARED_VIDEO_CATEGORIES.map((tab) => tab.value);
    const currentIndex = tabs.indexOf(activeTab);
    const nextTab = tabs[diffX < 0 ? currentIndex + 1 : currentIndex - 1];
    if (nextTab) {
      setActiveTab(nextTab);
    }
  };

  const handleCloseViewer = useCallback(() => {
    if (!returnState) {
      router.push("/");
      return;
    }

    savePendingVideoReturnState(returnState);
    router.push(returnState.path || "/");
  }, [returnState, router]);

  return (
    <section
      className="reels-shell videos-page-shell"
      onTouchStart={handleHorizontalSwipeStart}
      onTouchEnd={handleHorizontalSwipeEnd}
    >
      {returnState ? (
        <button
          type="button"
          className="header-icon-button videos-page-close"
          onClick={handleCloseViewer}
          aria-label={`Close ${returnState.originLabel ?? "videos"} viewer`}
        >
          <span className="header-icon-glyph" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </span>
        </button>
      ) : null}
      <div className="videos-page-tab-row" role="tablist" aria-label="Video categories">
        {SHARED_VIDEO_CATEGORIES.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={`videos-page-tab ${
              activeTab === tab.value ? "videos-page-tab-active" : ""
            }`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {statusMessage ? <div className="chip chip-accent reels-status">{statusMessage}</div> : null}
      {isCurrentTabLoading && hasLoadedOnce ? (
        <div className="muted reels-inline-status">Refreshing videos...</div>
      ) : null}

      {isLoading && !hasLoadedOnce ? (
        <div className="loading-state">
          <strong>Loading videos...</strong>
          <span>{statusMessage || "Fetching the latest channel feed."}</span>
        </div>
      ) : null}

      {displayedVideos.length === 0 && !isCurrentTabLoading ? (
        <div className="empty-state compact-empty-state">
          <strong>
            {activeTab === "sports"
              ? "No sports videos yet"
              : activeTab === "politics"
                ? "No politics videos available right now."
              : activeTab === "celebrity"
                ? "No celebrity videos yet"
                : activeTab === "technology"
                  ? "No technology videos available right now."
                : "No news videos yet"}
          </strong>
          <span>Check back shortly for a fresh vertical video feed.</span>
        </div>
      ) : null}

      <div className="reels-feed">
        {displayedVideos.map((video) => {
            const isAutoplaying = autoplayVideoId === video.id && !video.fallback;

            return (
              <article key={video.id} id={`video-${video.id}`} className="reel-card">
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

                  <div className="reel-source-meta">
                    <div className="reel-source-row">
                      <SourceBadge sourceName={video.creator} />
                      <span className="reel-creator">{video.creator}</span>
                    </div>
                  </div>

                  <div className="reel-meta">
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
