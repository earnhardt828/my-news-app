const SOURCE_DOMAIN_MAP: Record<string, string> = {
  CNN: "cnn.com",
  "BBC News": "bbc.com",
  "Fox News": "foxnews.com",
  CNBC: "cnbc.com",
  Bloomberg: "bloomberg.com",
  "Associated Press": "apnews.com",
  Reuters: "reuters.com",
  "CBS News": "cbsnews.com",
  "NBC News": "nbcnews.com",
  "The Washington Post": "washingtonpost.com",
};

export function getSourceDomain(sourceName: string) {
  return SOURCE_DOMAIN_MAP[sourceName] ?? null;
}

export function getSourceLogoUrl(sourceName: string) {
  const domain = getSourceDomain(sourceName);
  const token = process.env.NEXT_PUBLIC_LOGODEV_TOKEN;

  if (!domain) {
    return null;
  }

  // Real source logos depend on a known publisher -> domain mapping plus
  // a provider that can return a valid favicon/logo for that domain.
  // We try Logo.dev first when configured, then fall back to a Clearbit-style
  // domain lookup URL. If either provider fails in the UI, SourceBadge falls
  // back to the in-app letter badge so Reflekt never shows a broken image box.
  if (token) {
    return `https://img.logo.dev/${domain}?token=${token}&format=png&size=128`;
  }

  return `https://logo.clearbit.com/${domain}?size=128`;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
