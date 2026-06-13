"use client";

import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, isNativeCapacitorRuntime } from "../../lib/api-base";
import HeartIcon from "../components/heart-icon";
import ShareButton from "../components/share-button";
import SourceBadge from "../components/source-badge";
import { openOriginalArticleUrl } from "../../lib/open-article";
import {
  CELEBRITY_VIDEOS_DISABLED,
  readVideoReturnState,
  savePendingVideoReturnState,
  SHARED_VIDEO_CATEGORIES,
  TECH_VIDEOS_DISABLED,
  type SharedVideoTab,
  type VideoReturnState,
} from "../../lib/video-navigation";
import {
  buildVideoEmbedUrl,
  normalizeVideoFeedItems,
  type VideoApiItem,
  type VideoItem,
} from "../../lib/video-feed";
import { isTechnologyTabVideo, isStrictPoliticsVideo, isStrictWorldVideo } from "../../lib/video-filters";

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

type VideoTab = SharedVideoTab;

export default function VideosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<VideoTab>("news");
  const [videosByTab, setVideosByTab] = useState<Record<VideoTab, VideoItem[]>>({
    news: [],
    world: [],
    politics: [],
    sports: [],
    celebrity: [],
    technology: [],
  });
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(
    null
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeVideoEmbedLoaded, setActiveVideoEmbedLoaded] = useState(false);
  const [activeVideoEmbedFailed, setActiveVideoEmbedFailed] = useState(false);
  const [autoplayVideoId, setAutoplayVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(true);
  const [tabLoading, setTabLoading] = useState<Record<VideoTab, boolean>>({
    news: true,
    world: false,
    politics: false,
    sports: false,
    celebrity: false,
    technology: false,
  });
  const [statusMessages, setStatusMessages] = useState<Record<VideoTab, string>>({
    news: "",
    world: "",
    politics: "",
    sports: "",
    celebrity: "",
    technology: "",
  });
  const videoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasLoadedOnceRef = useRef(false);
  const loadedTabsRef = useRef<Record<VideoTab, boolean>>({
    news: false,
    world: false,
    politics: false,
    sports: false,
    celebrity: false,
    technology: false,
  });
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const visibleTabs = useMemo(
    () => SHARED_VIDEO_CATEGORIES.filter((tab) => tab.value === "news"),
    []
  );
  const isNativeCapacitor = isNativeCapacitorRuntime();

  const displayedVideosRaw = videosByTab[activeTab];
  const displayedVideos =
    activeTab === "technology"
      ? displayedVideosRaw.filter((video) => isTechnologyTabVideo(video))
      : activeTab === "world"
        ? displayedVideosRaw.filter((video) => isStrictWorldVideo(video))
      : displayedVideosRaw;
  const statusMessage = statusMessages[activeTab];
  const isCurrentTabLoading = tabLoading[activeTab];
  const requestedTabValue = searchParams?.get("tab") ?? "";
  const requestedVideoId = searchParams?.get("video") ?? "";
  const requestedTab =
    requestedTabValue === "sports"
      ? "sports"
      : requestedTabValue === "world"
        ? "world"
      : requestedTabValue === "politics"
        ? "politics"
      : requestedTabValue === "celebrity" && !CELEBRITY_VIDEOS_DISABLED
        ? "celebrity"
        : requestedTabValue === "technology" && !TECH_VIDEOS_DISABLED
          ? "technology"
        : "news";
  const [returnState, setReturnState] = useState<VideoReturnState | null>(null);

  useEffect(() => {
    console.log("VIDEO PAGE ACTIVE TABS", visibleTabs.map((tab) => tab.value));
    console.log("VIDEOS TABS REMOVED", ["sports", "politics", "world"]);
    console.log("VIDEOS DEFAULT_TAB", "news");
  }, [visibleTabs]);

  useEffect(() => {
    console.log("VIDEO PAGE ACTIVE TAB", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "technology") {
      return;
    }

    console.log("TECHNOLOGY RENDER FILTERED COUNT", displayedVideos.length);
  }, [activeTab, displayedVideos.length]);

  useEffect(() => {
    setReturnState(readVideoReturnState());
  }, []);

  const loadVideosForTab = useCallback(async (tab: VideoTab, force = false) => {
    if (loadedTabsRef.current[tab] && !force) {
      return;
    }

    const cacheKey = `graffiti:videos:${tab}`;
    const shouldBlockScreen = false;
    const cachedVideos =
      typeof window !== "undefined"
        ? (() => {
            try {
              const raw = window.localStorage.getItem(cacheKey);
              return raw ? (JSON.parse(raw) as VideoItem[]) : null;
            } catch {
              return null;
            }
          })()
        : null;

    if (cachedVideos?.length) {
      setVideosByTab((prev) => ({
        ...prev,
        [tab]: cachedVideos,
      }));
      loadedTabsRef.current[tab] = true;
    }

    setTabLoading((prev) => ({ ...prev, [tab]: true }));

    try {
      const fetchUrl = `/api/videos?tab=${tab}`;
      console.log("VIDEO PAGE FETCH URL", fetchUrl);
      const response = await Promise.race([
        apiFetch(fetchUrl),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Video page request timed out")), 6000);
        }),
      ]);
      const data = (await response.json()) as {
        videos?: VideoApiItem[];
        fallback?: boolean;
        message?: string;
        fetchFailed?: boolean;
      };

      const normalizedVideos = normalizeVideoFeedItems(data.videos).filter((video) =>
        Boolean(video.youtubeId)
      );

      setVideosByTab((prev) => ({
        ...prev,
        [tab]: normalizedVideos,
      }));
      if (typeof window !== "undefined" && normalizedVideos.length > 0) {
        window.localStorage.setItem(cacheKey, JSON.stringify(normalizedVideos));
      }
      setStatusMessages((prev) => ({
        ...prev,
        [tab]: data.fallback || data.fetchFailed ? data.message ?? "" : "",
      }));
      loadedTabsRef.current[tab] = true;
    } catch (error) {
      console.error(`Error loading ${tab} video feed:`, error);
      setVideosByTab((prev) => ({
        ...prev,
        [tab]: [],
      }));
      setStatusMessages((prev) => ({
        ...prev,
        [tab]:
          tab === "sports"
            ? "Could not load live sports videos right now."
            : tab === "world" || tab === "technology"
              ? "Could not load videos right now."
            : tab === "politics"
              ? "Could not load live politics videos right now."
            : tab === "celebrity"
              ? "Could not load live celebrity videos right now."
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
    setActiveVideoEmbedLoaded(false);
    setActiveVideoEmbedFailed(false);
  }, [activeVideoId]);

  useEffect(() => {
    if (!activeVideoId || displayedVideos.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!activeVideoEmbedLoaded) {
        setActiveVideoEmbedFailed(true);
      }
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeVideoEmbedLoaded, activeVideoId, displayedVideos.length]);

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

  const activeVideoEmbedUrl = useMemo(
    () =>
      activeVideo
        ? buildVideoEmbedUrl(activeVideo.youtubeId, true, {
            mute: false,
            controls: true,
            loop: false,
            enableJsApi: true,
            origin: "https://my-news-app-git-main-earnhardt828s-projects.vercel.app",
          })
        : null,
    [activeVideo]
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
      world: updateVideos(prev.world),
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
      world: updateVideos(prev.world),
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

  const handleHorizontalSwipeEnd = (_event: TouchEvent<HTMLElement>) => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleCloseViewer = useCallback(() => {
    if (!returnState) {
      router.push("/");
      return;
    }

    savePendingVideoReturnState(returnState);
    router.push(returnState.path || "/");
  }, [returnState, router]);

  const handleOpenExternalVideo = useCallback(async (video: VideoItem) => {
    if (video.watchUrl) {
      await openOriginalArticleUrl(video.watchUrl);
      return;
    }

    if (typeof window !== "undefined") {
      window.open(`https://www.youtube.com/watch?v=${video.youtubeId}`, "_blank", "noopener,noreferrer");
    }
  }, []);

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
      {statusMessage ? <div className="chip chip-accent reels-status">{statusMessage}</div> : null}
      {isCurrentTabLoading && hasLoadedOnce ? (
        <div className="muted reels-inline-status">Refreshing videos...</div>
      ) : null}
      {isLoading && !hasLoadedOnce ? (
        <div className="loading-state">
          <span className="loading-screen-spinner" aria-hidden="true" />
          <strong>Loading videos...</strong>
          <span>{statusMessage || "Fetching the latest channel feed."}</span>
        </div>
      ) : null}

      {displayedVideos.length === 0 && !isCurrentTabLoading ? (
        <div className="empty-state compact-empty-state">
          <strong>
            {activeTab === "sports"
              ? "No sports videos yet"
              : activeTab === "world"
                ? statusMessage || "No world videos available right now."
              : activeTab === "politics"
                ? statusMessage || "No politics videos available right now."
              : activeTab === "celebrity"
                ? statusMessage || "No celebrity videos available right now."
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
            const shouldRenderEmbed = isAutoplaying && !isNativeCapacitor;

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

                  {shouldRenderEmbed ? (
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
                      onClick={() =>
                        isNativeCapacitor
                          ? void handleOpenExternalVideo(video)
                          : setActiveVideoId(video.id)
                      }
                      aria-label={isNativeCapacitor ? `Watch ${video.title}` : `Play ${video.title}`}
                    >
                      <div className="reel-play-overlay">
                        <span className="video-play-badge" aria-hidden="true" />
                        <span className="video-live-pill">
                          {isNativeCapacitor ? "Watch Video" : "Tap to play"}
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
                        <HeartIcon filled={video.liked} size={20} strokeWidth={1.9} />
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
                This feed uses real news videos. For now, comments remain
                a lightweight placeholder instead of syncing live comment threads.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeVideo && !isNativeCapacitor ? (
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

            {activeVideoEmbedUrl && !activeVideoEmbedFailed ? (
              <div className="stack" style={{ gap: "14px" }}>
                <div className="video-player-shell">
                  <iframe
                    src={activeVideoEmbedUrl}
                    title={activeVideo.title}
                    className="video-player-frame"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    onLoad={() => setActiveVideoEmbedLoaded(true)}
                    onError={() => setActiveVideoEmbedFailed(true)}
                  />
                </div>
                {!activeVideoEmbedLoaded ? (
                  <div className="muted" style={{ textAlign: "center" }}>
                    Loading video...
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state">
                {activeVideo.thumbnailUrl ? (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "16 / 9",
                      borderRadius: "20px",
                      overflow: "hidden",
                      marginBottom: "14px",
                    }}
                  >
                    <Image
                      src={activeVideo.thumbnailUrl}
                      alt={activeVideo.title}
                      fill
                      sizes="100vw"
                      className="reel-thumbnail"
                      unoptimized
                    />
                  </div>
                ) : null}
                <strong>Watch on YouTube</strong>
                <span>
                  This video could not be played in the in-app player. Open it in YouTube or Safari instead.
                </span>
                <button
                  type="button"
                  className="button"
                  onClick={() => void handleOpenExternalVideo(activeVideo)}
                >
                  Watch on YouTube
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
