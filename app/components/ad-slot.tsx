"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSlotProps = {
  title: string;
  copy: string;
  cta?: string;
  slot?: string;
};

export default function AdSlot({
  title,
  copy,
  cta = "Ad placeholder",
  slot,
}: AdSlotProps) {
  const adClient = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT;
  const adSlot = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED;
  const shouldRenderAdsense = Boolean(adClient && adSlot);

  useEffect(() => {
    if (!shouldRenderAdsense) {
      return;
    }

    try {
      window.adsbygoogle = window.adsbygoogle ?? [];
      window.adsbygoogle.push({});
    } catch (error) {
      console.error("AdSense slot could not be initialized:", error);
    }
  }, [shouldRenderAdsense, adSlot]);

  if (!shouldRenderAdsense) {
    return (
      <aside className="ad-card" aria-label="Sponsored content placeholder">
        <span className="ad-label">Sponsored</span>
        <h3 className="ad-title">{title}</h3>
        <p className="ad-copy">{copy}</p>
        <span className="ad-cta">{cta}</span>
      </aside>
    );
  }

  return (
    <aside className="ad-card" aria-label="Sponsored content">
      <span className="ad-label">Sponsored</span>
      <ins
        className="adsbygoogle ad-adsense-frame"
        style={{ display: "block" }}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
