"use client";

import { useEffect, useMemo, useState } from "react";
import { openOriginalArticleUrl, type ArticleReaderLaunchPayload } from "../../lib/open-article";
import { supabase } from "../../lib/supabase";
import { cleanDisplayText } from "../../lib/display-text";

type ReaderCommentCountResponse = { count: number | null };
type ReaderLikeRow = { id: number; user_id: string | null };
type ReaderSavedRow = { article_id: number | null };

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function ArticleSourceReaderModal() {
  const [activeArticle, setActiveArticle] = useState<ArticleReaderLaunchPayload | null>(null);
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [isReaderLoaded, setIsReaderLoaded] = useState(false);
  const [showBlockedFallback, setShowBlockedFallback] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [likedByCurrentUser, setLikedByCurrentUser] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isCommentsSheetOpen, setIsCommentsSheetOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<"like" | "save" | null>(null);

  const articleId = activeArticle?.id ?? null;
  const articleUrl = activeArticle?.url?.trim() ?? null;
  const articleTitle = cleanDisplayText(activeArticle?.title ?? "Article");
  const articleSource = cleanDisplayText(activeArticle?.source ?? "Original source");
  const commentsReaderUrl =
    articleId !== null ? `/article/${articleId}/?comments=1` : null;

  useEffect(() => {
    const handleOpenReader = (event: Event) => {
      const customEvent = event as CustomEvent<ArticleReaderLaunchPayload>;
      const detail = customEvent.detail;

      if (!detail?.url?.trim()) {
        return;
      }

      setActiveArticle(detail);
      setIsReaderOpen(true);
      setIsReaderLoaded(false);
      setShowBlockedFallback(false);
      setIsCommentsSheetOpen(false);
    };

    window.addEventListener("reflekt:open-article-reader", handleOpenReader as EventListener);

    return () => {
      window.removeEventListener("reflekt:open-article-reader", handleOpenReader as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isReaderOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isReaderOpen]);

  useEffect(() => {
    if (!isReaderOpen || isReaderLoaded) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowBlockedFallback(true);
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isReaderLoaded, isReaderOpen, articleUrl]);

  useEffect(() => {
    if (!isReaderOpen || articleId === null) {
      return;
    }

    let isCancelled = false;

    async function loadEngagement() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      if (isCancelled) {
        return;
      }

      setUserId(currentUserId);

      const [likesResult, savedResult, commentsResult] = await Promise.all([
        supabase.from("likes").select("id, user_id").eq("article_id", articleId),
        currentUserId
          ? supabase
              .from("saved_articles")
              .select("article_id")
              .eq("user_id", currentUserId)
              .eq("article_id", articleId)
              .maybeSingle()
          : Promise.resolve({ data: null as ReaderSavedRow | null, error: null }),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("article_id", articleId),
      ]);

      if (isCancelled) {
        return;
      }

      const likesRows = (likesResult.data ?? []) as ReaderLikeRow[];
      const savedRow = (savedResult.data ?? null) as ReaderSavedRow | null;
      const commentsCountResult = (commentsResult.count ?? 0) as number;

      setLikesCount(likesRows.length);
      setLikedByCurrentUser(Boolean(currentUserId && likesRows.some((row) => row.user_id === currentUserId)));
      setIsSaved(Boolean(savedRow));
      setCommentsCount(commentsCountResult);
    }

    void loadEngagement();

    return () => {
      isCancelled = true;
    };
  }, [articleId, isReaderOpen]);

  const closeReader = () => {
    setIsReaderOpen(false);
    setIsCommentsSheetOpen(false);
    setShowBlockedFallback(false);
    setIsReaderLoaded(false);
  };

  const handleToggleLike = async () => {
    if (!userId || articleId === null) {
      return;
    }

    setActiveAction("like");

    if (likedByCurrentUser) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("article_id", articleId)
        .eq("user_id", userId);

      if (!error) {
        setLikedByCurrentUser(false);
        setLikesCount((current) => Math.max(0, current - 1));
      }
    } else {
      const { error } = await supabase.from("likes").insert({
        article_id: articleId,
        user_id: userId,
      });

      if (!error) {
        setLikedByCurrentUser(true);
        setLikesCount((current) => current + 1);
      }
    }

    setActiveAction(null);
  };

  const handleToggleSave = async () => {
    if (!userId || articleId === null) {
      return;
    }

    setActiveAction("save");

    if (isSaved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", articleId);

      if (!error) {
        setIsSaved(false);
      }
    } else {
      const { error } = await supabase.from("saved_articles").upsert(
        {
          user_id: userId,
          article_id: articleId,
          title: articleTitle,
          source: articleSource,
          url: articleUrl,
          image: null,
        },
        { onConflict: "user_id,article_id" }
      );

      if (!error) {
        setIsSaved(true);
      }
    }

    setActiveAction(null);
  };

  const headerSourceLabel = useMemo(() => articleSource || "Original source", [articleSource]);

  if (!isReaderOpen || !articleUrl) {
    return null;
  }

  return (
    <div className="modal-backdrop article-reader-shell-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card reader-modal-card article-reader-modal-card">
        <div className="reader-modal-header article-reader-modal-header">
          <button className="button button-secondary" type="button" onClick={closeReader}>
            Close
          </button>
          <div className="stack article-reader-modal-title-wrap" style={{ gap: "4px" }}>
            <strong className="article-reader-modal-source">{headerSourceLabel}</strong>
            <span className="muted article-reader-modal-caption">{articleTitle}</span>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              void openOriginalArticleUrl(articleUrl);
            }}
          >
            Open in Browser
          </button>
        </div>

        <div className="reader-frame-shell article-reader-frame-shell">
          {!showBlockedFallback ? (
            <iframe
              src={articleUrl}
              title={articleTitle}
              className="reader-frame article-reader-frame"
              onLoad={() => setIsReaderLoaded(true)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          ) : (
            <div className="reader-loading-state">
              <strong>This publisher blocks in-app viewing.</strong>
              <span>You can still open the original source without leaving Reflekt first.</span>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  void openOriginalArticleUrl(articleUrl);
                }}
              >
                Open Original Source
              </button>
            </div>
          )}
        </div>

        <div className="engagement-row article-detail-actions article-reader-modal-actions">
          <button
            className={`icon-action-pill ${likedByCurrentUser ? "icon-action-pill-active" : ""}`}
            type="button"
            onClick={() => {
              void handleToggleLike();
            }}
            disabled={activeAction === "like"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                  fill={likedByCurrentUser ? "currentColor" : "none"}
                />
              </svg>
            </span>
            <span>{likesCount}</span>
          </button>
          <button
            className="icon-action-pill"
            type="button"
            onClick={() => setIsCommentsSheetOpen(true)}
            disabled={articleId === null}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
              </svg>
            </span>
            <span>{commentsCount}</span>
          </button>
          <button
            className={`bookmark-button ${isSaved ? "bookmark-button-active" : ""}`}
            type="button"
            onClick={() => {
              void handleToggleSave();
            }}
            disabled={activeAction === "save"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                  fill={isSaved ? "currentColor" : "none"}
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {isCommentsSheetOpen && commentsReaderUrl ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comments"
          onClick={() => setIsCommentsSheetOpen(false)}
        >
          <section
            className="bottom-sheet article-comments-reader-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="article-comments-inline-header">
              <h3 className="article-comments-inline-title">Comments</h3>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setIsCommentsSheetOpen(false)}
              >
                Close
              </button>
            </div>
            <iframe
              src={commentsReaderUrl}
              title={`${articleTitle} comments`}
              className="reader-frame article-comments-reader-frame"
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
