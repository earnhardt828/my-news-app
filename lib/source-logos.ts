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

  if (!domain || !token) {
    return null;
  }

  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=128`;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
