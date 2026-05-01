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
                  X
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
                  IG
                </span>
                <span className="share-sheet-label">Instagram</span>
              </button>

              <button
                type="button"
                className="share-sheet-option"
                onClick={handleTextShare}
              >
                <span className="share-sheet-icon" aria-hidden="true">
                  SMS
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
                  R
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
                  ⧉
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
