"use client";

import { useMemo, useState } from "react";

type ShareButtonProps = {
  path: string;
  title: string;
  url?: string | null;
  iconOnly?: boolean;
  className?: string;
};

const iconProps = {
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

type ShareFeedback = {
  type: "success" | "error";
  text: string;
} | null;

export default function ShareButton({
  path,
  title,
  url,
  iconOnly = false,
  className = "",
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<ShareFeedback>(null);

  const targetUrl = useMemo(
    () =>
      url ??
      (typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path),
    [path, url]
  );

  const encodedUrl = encodeURIComponent(targetUrl);
  const encodedTitle = encodeURIComponent(title);
  const canUseNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const openSheet = () => {
    setFeedback(null);
    setIsOpen(true);
  };

  const closeSheet = () => {
    setIsOpen(false);
    setFeedback(null);
  };

  const openExternalShareUrl = (shareUrl: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setFeedback(null);
    setIsOpen(false);
  };

  const handleTextShare = () => {
    if (typeof window === "undefined") {
      return;
    }

    setFeedback(null);
    setIsOpen(false);
    window.location.href = `sms:?body=${encodeURIComponent(`${title} ${targetUrl}`)}`;
  };

  const handleCopyLink = async (message = "Link copied") => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(targetUrl);
        setFeedback({
          type: "success",
          text: message,
        });
        return;
      }

      setFeedback({
        type: "error",
        text: "Copy is not available on this device.",
      });
    } catch (error) {
      console.error("Error copying article link:", error);
      setFeedback({
        type: "error",
        text: "Could not copy link.",
      });
    }
  };

  const handleInstagramShare = async () => {
    await handleCopyLink("Link copied");
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare) {
      return;
    }

    try {
      await navigator.share({
        title,
        url: targetUrl,
      });
      setIsOpen(false);
      setFeedback(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error opening native share:", error);
      setFeedback({
        type: "error",
        text: "Could not open share menu.",
      });
    }
  };

  return (
    <>
      <button
        className={`${
          iconOnly
            ? "icon-action-pill icon-action-pill-icon-only share-trigger-button"
            : "button button-secondary share-trigger-button"
        } ${className}`.trim()}
        onClick={openSheet}
        aria-label="Share article"
      >
        {iconOnly ? (
          <span className="icon-action-glyph" aria-hidden="true">
            <svg {...iconProps}>
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </span>
        ) : (
          "Share"
        )}
      </button>

      {isOpen ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Share article"
          onClick={closeSheet}
        >
          <div
            className="bottom-sheet share-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header share-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 className="bottom-sheet-title">Share</h3>
                <p className="muted bottom-sheet-title">{title}</p>
              </div>
            </div>

            <div className="share-sheet-grid">
              {canUseNativeShare ? (
                <button
                  type="button"
                  className="share-sheet-option"
                  onClick={() => {
                    void handleNativeShare();
                  }}
                >
                  <span className="share-sheet-icon" aria-hidden="true">
                    <svg {...iconProps}>
                      <path d="M7 17 17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </span>
                  <span className="share-sheet-label">More</span>
                </button>
              ) : null}

              <button
                type="button"
                className="share-sheet-option"
                onClick={() =>
                  openExternalShareUrl(
                    `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
                  )
                }
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  <svg {...iconProps}>
                    <path d="m6 6 12 12" />
                    <path d="m18 6-5 5" />
                    <path d="m11 13-5 5" />
                  </svg>
                </span>
                <span className="share-sheet-label">X</span>
              </button>

              <button
                type="button"
                className="share-sheet-option"
                onClick={() => {
                  void handleInstagramShare();
                }}
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  <svg {...iconProps}>
                    <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
                    <circle cx="12" cy="12" r="3.4" />
                    <circle cx="16.8" cy="7.4" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="share-sheet-label">Instagram</span>
              </button>

              <button
                type="button"
                className="share-sheet-option"
                onClick={handleTextShare}
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  <svg {...iconProps}>
                    <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                  </svg>
                </span>
                <span className="share-sheet-label">Text</span>
              </button>

              <button
                type="button"
                className="share-sheet-option"
                onClick={() =>
                  openExternalShareUrl(
                    `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`
                  )
                }
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  <svg {...iconProps}>
                    <circle cx="12" cy="12.6" r="3.2" />
                    <path d="M7.2 10.4a8.4 8.4 0 0 1 9.6 0" />
                    <path d="M8.6 16.1c1 .8 2.2 1.2 3.4 1.2 1.3 0 2.5-.4 3.5-1.2" />
                    <circle cx="8" cy="12.1" r="1" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="12.1" r="1" fill="currentColor" stroke="none" />
                    <path d="M16.9 7.7 19 6.8" />
                    <circle cx="19.5" cy="6.6" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="share-sheet-label">Reddit</span>
              </button>

              <button
                type="button"
                className="share-sheet-option share-sheet-option-wide"
                onClick={() => {
                  void handleCopyLink();
                }}
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  <svg {...iconProps}>
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
                  </svg>
                </span>
                <span className="share-sheet-label">Copy Link</span>
              </button>
            </div>

            {feedback ? (
              <div
                className={`status-message ${
                  feedback.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {feedback.text}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
