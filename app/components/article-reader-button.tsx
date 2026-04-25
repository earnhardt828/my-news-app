"use client";

import { useEffect, useState } from "react";

type ArticleReaderButtonProps = {
  title: string;
  url?: string | null;
};

export default function ArticleReaderButton({
  title,
  url,
}: ArticleReaderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFrameLoading, setIsFrameLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const openReader = () => {
    if (!url) {
      return;
    }

    setIsFrameLoading(true);
    setIsOpen(true);
  };

  const closeReader = () => {
    setIsOpen(false);
    setIsFrameLoading(false);
  };

  return (
    <>
      <button
        className="button button-secondary"
        onClick={openReader}
        disabled={!url}
      >
        Read Full Article
      </button>

      {isOpen && url ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-reader-title"
        >
          <div className="modal-card reader-modal-card">
            <div className="reader-modal-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="article-reader-title" className="modal-title">
                  {title}
                </h3>
                <p className="muted" style={{ margin: 0 }}>
                  Embedded article view
                </p>
              </div>

              <button className="button button-secondary" onClick={closeReader}>
                Close
              </button>
            </div>

            <div className="reader-frame-shell">
              {isFrameLoading ? (
                <div className="reader-loading-state">
                  <strong>Loading article</strong>
                  <span>
                    Pulling the publisher page into Mirur. Some sites may limit
                    embedded previews.
                  </span>
                </div>
              ) : null}

              <iframe
                src={url}
                title={title}
                className="reader-frame"
                onLoad={() => setIsFrameLoading(false)}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
