"use client";

import Image from "next/image";
import { useState } from "react";
import { getSourceInitial, getSourceLogoUrl } from "../../lib/source-logos";

type SourceBadgeProps = {
  sourceName: string;
  className?: string;
};

export default function SourceBadge({
  sourceName,
  className = "",
}: SourceBadgeProps) {
  const [failedSourceName, setFailedSourceName] = useState<string | null>(null);
  const logoUrl = getSourceLogoUrl(sourceName);
  const showLogo = Boolean(logoUrl) && failedSourceName !== sourceName;

  return (
    <span className={`source-avatar ${className}`.trim()} aria-hidden="true">
      {showLogo ? (
        <Image
          src={logoUrl!}
          alt={`${sourceName} logo`}
          width={34}
          height={34}
          className="source-avatar-image"
          unoptimized
          onError={() => setFailedSourceName(sourceName)}
        />
      ) : (
        <span className="source-avatar-fallback">{getSourceInitial(sourceName)}</span>
      )}
    </span>
  );
}
