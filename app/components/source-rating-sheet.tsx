"use client";

import SourceBadge from "./source-badge";

type SourceRatingSheetProps = {
  sourceName: string | null;
  isOpen: boolean;
  currentRating: "like" | "dislike" | null;
  isSaving?: boolean;
  status?: {
    type: "success" | "error";
    text: string;
  } | null;
  onLike: () => void;
  onDislike: () => void;
  onClose: () => void;
};

export default function SourceRatingSheet({
  sourceName,
  isOpen,
  currentRating,
  isSaving = false,
  status = null,
  onLike,
  onDislike,
  onClose,
}: SourceRatingSheetProps) {
  if (!isOpen || !sourceName) {
    return null;
  }

  return (
    <div className="source-sheet-overlay" role="dialog" aria-modal="true">
      <button
        className="bottom-sheet-backdrop"
        aria-label="Close source rating sheet"
        onClick={onClose}
      />
      <section className="bottom-sheet source-sheet" aria-labelledby="source-rating-sheet-title">
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header source-sheet-header">
          <div className="source-sheet-brand">
            <SourceBadge sourceName={sourceName} />
            <div className="stack" style={{ gap: "4px" }}>
              <h3 id="source-rating-sheet-title" className="bottom-sheet-title">
                {sourceName}
              </h3>
              <span className="muted">This affects My Feed only.</span>
            </div>
          </div>
        </div>

        <div className="source-sheet-actions">
          <button
            type="button"
            className={`button button-secondary source-sheet-button ${
              currentRating === "like" ? "source-sheet-button-active" : ""
            }`}
            onClick={onLike}
            disabled={isSaving}
          >
            {isSaving && currentRating === "like" ? "Saving..." : "Like"}
          </button>
          <button
            type="button"
            className={`button button-secondary source-sheet-button ${
              currentRating === "dislike" ? "source-sheet-button-muted" : ""
            }`}
            onClick={onDislike}
            disabled={isSaving}
          >
            {isSaving && currentRating === "dislike" ? "Saving..." : "Dislike"}
          </button>
          <button
            type="button"
            className="button button-secondary source-sheet-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {status ? (
          <div
            className={`status-message ${
              status.type === "success" ? "status-success" : "status-error"
            }`}
          >
            {status.text}
          </div>
        ) : null}
      </section>
    </div>
  );
}
