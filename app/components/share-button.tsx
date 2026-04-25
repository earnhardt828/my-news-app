"use client";

import { useState } from "react";

type ShareButtonProps = {
  path: string;
  title: string;
  url?: string | null;
};

export default function ShareButton({ path, title, url }: ShareButtonProps) {
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

  return (
    <button className="button button-secondary" onClick={handleShare}>
      {status === "sharing" ? "Sharing..." : status === "copied" ? "Copied" : "Share"}
    </button>
  );
}
