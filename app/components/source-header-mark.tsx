"use client";

import { useState } from "react";
import {
  getArticleHeaderLogo,
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
  const [failedLightLogoUrl, setFailedLightLogoUrl] = useState<string | null>(null);
  const [failedDarkLogoUrl, setFailedDarkLogoUrl] = useState<string | null>(null);
  const lightLogoUrl = getArticleHeaderLogo(sourceName, "light");
  const darkLogoUrl = getArticleHeaderLogo(sourceName, "dark");
  const showLightLogo = Boolean(lightLogoUrl) && failedLightLogoUrl !== lightLogoUrl;
  const showDarkLogo = Boolean(darkLogoUrl) && failedDarkLogoUrl !== darkLogoUrl;

  if (showLightLogo || showDarkLogo) {
    return (
      <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
        {showLightLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightLogoUrl!}
            alt={`${sourceName} header logo`}
            className={`source-header-logo ${showDarkLogo ? "branding-image-light" : ""}`.trim()}
            loading="lazy"
            onError={() => setFailedLightLogoUrl(lightLogoUrl)}
          />
        ) : null}
        {showDarkLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={darkLogoUrl!}
            alt={`${sourceName} dark header logo`}
            className={`source-header-logo ${showLightLogo ? "branding-image-dark" : ""}`.trim()}
            loading="lazy"
            onError={() => setFailedDarkLogoUrl(darkLogoUrl)}
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
