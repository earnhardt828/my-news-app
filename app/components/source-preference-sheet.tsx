"use client";

import SourceBadge from "./source-badge";

type SourcePreferenceSheetProps = {
  sourceName: string | null;
  isOpen: boolean;
  isPreferred: boolean;
  isShowLess: boolean;
  isSaving?: boolean;
  status?: {
    type: "success" | "error";
    text: string;
  } | null;
  onPrefer: () => void;
  onShowLess: () => void;
  onClose: () => void;
};

export default function SourcePreferenceSheet({
  sourceName,
  isOpen,
  isPreferred,
  isShowLess,
  isSaving = false,
  status = null,
  onPrefer,
  onShowLess,
  onClose,
}: SourcePreferenceSheetProps) {
  if (!isOpen || !sourceName) {
    return null;
  }

  return (
    <>
      <button
        className="bottom-sheet-backdrop"
        aria-label="Close source options"
        onClick={onClose}
      />
      <section className="bottom-sheet source-sheet" aria-labelledby="source-sheet-title">
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header source-sheet-header">
          <div className="source-sheet-brand">
            <SourceBadge sourceName={sourceName} />
            <div className="stack" style={{ gap: "4px" }}>
              <h3 id="source-sheet-title" className="bottom-sheet-title">
                {sourceName}
              </h3>
              <span className="muted">Adjust how this source shows up in My News.</span>
            </div>
          </div>
        </div>

        <div className="source-sheet-actions">
          <button
            type="button"
            className={`button button-secondary source-sheet-button ${
              isPreferred ? "source-sheet-button-active" : ""
            }`}
            onClick={onPrefer}
            disabled={isSaving}
          >
            {isSaving && isPreferred ? "Saving..." : "Show more from this source"}
          </button>
          <button
            type="button"
            className={`button button-secondary source-sheet-button ${
              isShowLess ? "source-sheet-button-muted" : ""
            }`}
            onClick={onShowLess}
            disabled={isSaving}
          >
            {isSaving && isShowLess ? "Saving..." : "Show less from this source"}
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
    </>
  );
}
