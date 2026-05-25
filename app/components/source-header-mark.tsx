"use client";

import { useState } from "react";
import { getSourceHeaderLogoUrl } from "../../lib/source-logos";
import SourceBadge from "./source-badge";

type SourceHeaderMarkProps = {
  sourceName: string;
  className?: string;
};

export default function SourceHeaderMark({
  sourceName,
  className = "",
}: SourceHeaderMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = getSourceHeaderLogoUrl(sourceName);

  if (logoUrl && !logoFailed) {
    return (
      <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`${sourceName} header logo`}
          className="source-header-logo"
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`source-header-mark ${className}`.trim()} aria-hidden="true">
      <SourceBadge sourceName={sourceName} />
    </span>
  );
}
