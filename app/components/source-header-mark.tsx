"use client";

import { useEffect, useState } from "react";
import {
  getArticleHeaderLogo,
} from "../../lib/source-logos";
import SourceBadge from "./source-badge";

let hasLoggedHeaderLogoSync = false;

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
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (!hasLoggedHeaderLogoSync) {
      console.log("HEADER LOGOS SYNCED", true);
      hasLoggedHeaderLogoSync = true;
    }

    const updateTheme = () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const lightLogoUrl = getArticleHeaderLogo(sourceName, "light");
  const darkLogoUrl = getArticleHeaderLogo(sourceName, "dark");
  const activeLogoUrl =
    theme === "dark"
      ? (darkLogoUrl && failedDarkLogoUrl !== darkLogoUrl ? darkLogoUrl : null)
      : (lightLogoUrl && failedLightLogoUrl !== lightLogoUrl ? lightLogoUrl : null);

  useEffect(() => {
    if (activeLogoUrl) {
      console.log("HEADER LOGO FILE USED", {
        sourceName,
        logoUrl: activeLogoUrl,
        theme,
      });
    }
  }, [activeLogoUrl, sourceName, theme]);

  if (activeLogoUrl) {
    return (
      <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeLogoUrl}
          alt={`${sourceName} header logo`}
          className="source-header-logo"
          loading="lazy"
          onError={() => {
            if (theme === "dark") {
              setFailedDarkLogoUrl(activeLogoUrl);
            } else {
              setFailedLightLogoUrl(activeLogoUrl);
            }
          }}
        />
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
