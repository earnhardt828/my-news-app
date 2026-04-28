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

  // Real source logos depend on two things being configured correctly:
  // 1. a known publisher -> domain mapping in SOURCE_DOMAIN_MAP
  // 2. a working logo provider token
  // If either is missing, we intentionally fall back to the in-app letter badge
  // so Reflekt never renders broken or empty logo boxes.
  if (!token) {
    return null;
  }

  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=128`;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
