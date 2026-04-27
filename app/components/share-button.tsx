"use client";

import { useState } from "react";

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

export default function ShareButton({
  path,
  title,
  url,
  iconOnly = false,
  className = "",
}: ShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "sharing" | "copied">("idle");

  const handleShare = async () => {
    const targetUrl =
      url ??
      (typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path);

    try {
      setStatus("sharing");

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          url: targetUrl,
        });
        setStatus("idle");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(targetUrl);
        setStatus("copied");
        window.setTimeout(() => setStatus("idle"), 1500);
        return;
      }

      setStatus("idle");
    } catch (error) {
      console.error("Error sharing article:", error);
      setStatus("idle");
    }
  };

  const label =
    status === "sharing" ? "Sharing..." : status === "copied" ? "Copied" : "Share";

  return (
    <button
      className={`${iconOnly ? "icon-action-pill icon-action-pill-icon-only" : "button button-secondary"} ${className}`.trim()}
      onClick={handleShare}
      aria-label={label}
    >
      {iconOnly ? (
        <>
          <span className="icon-action-glyph" aria-hidden="true">
            {status === "copied" ? (
              <svg {...iconProps}>
                <path d="m5 12 4.2 4.2L19 6.5" />
              </svg>
            ) : (
              <svg {...iconProps}>
                <path d="M7 17 17 7" />
                <path d="M9 7h8v8" />
              </svg>
            )}
          </span>
          {status === "sharing" || status === "copied" ? <span>{label}</span> : null}
        </>
      ) : (
        label
      )}
    </button>
  );
}
