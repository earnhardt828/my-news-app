"use client";

import { useState } from "react";
import { getSourceInitial, getSourceLogoUrl } from "../../lib/source-logos";

type SourceBadgeProps = {
  sourceName: string;
  className?: string;
  showInitialFallback?: boolean;
};

export default function SourceBadge({
  sourceName,
  className = "",
  showInitialFallback = true,
}: SourceBadgeProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoUrl = getSourceLogoUrl(sourceName);
  const showLogo = Boolean(logoUrl) && failedLogoUrl !== logoUrl;

  return (
    <span className={`source-avatar ${className}`.trim()} aria-hidden="true">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt={`${sourceName} logo`}
          className="source-avatar-image"
          loading="lazy"
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : showInitialFallback ? (
        <span className="source-avatar-fallback">{getSourceInitial(sourceName)}</span>
      ) : null}
    </span>
  );
}
