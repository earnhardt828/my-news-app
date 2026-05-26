"use client";

import { useState } from "react";
import {
  getSourceHeaderDarkLogoUrl,
  getSourceHeaderLogoUrl,
} from "../../lib/source-logos";
import SourceBadge from "./source-badge";

type SourceHeaderMarkProps = {
  sourceName: string;
  className?: string;
  fallbackMode?: "badge" | "text";
};

export default function SourceHeaderMark({
  sourceName,
  className = "",
  fallbackMode = "badge",
}: SourceHeaderMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const lightLogoUrl = getSourceHeaderLogoUrl(sourceName);
  const darkLogoUrl = getSourceHeaderDarkLogoUrl(sourceName);

  if (lightLogoUrl && !logoFailed) {
    return (
      <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightLogoUrl}
          alt={`${sourceName} header logo`}
          className={`source-header-logo ${darkLogoUrl ? "branding-image-light" : ""}`.trim()}
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
        {darkLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={darkLogoUrl}
            alt={`${sourceName} dark header logo`}
            className="source-header-logo branding-image-dark"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : null}
      </span>
    );
  }

  if (fallbackMode === "text") {
    return <span className={`source-header-text-fallback ${className}`.trim()}>{sourceName}</span>;
  }

  return (
    <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
      <SourceBadge sourceName={sourceName} />
    </span>
  );
}
