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
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = getSourceLogoUrl(sourceName);
  const showLogo = Boolean(logoUrl) && !imageFailed;

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
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="source-avatar-fallback">{getSourceInitial(sourceName)}</span>
      )}
    </span>
  );
}
