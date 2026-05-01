const SOURCE_LOGO_MAP: Record<string, string> = {
  CNN: "/source-logos/cnn.png",
  "BBC News": "/source-logos/bbc.png",
  "Fox News": "/source-logos/fox-news.png",
  "AP News": "/source-logos/ap-news.png",
  "Associated Press": "/source-logos/ap-news.png",
  Reuters: "/source-logos/reuters.png",
  "The New York Times": "/source-logos/the-new-york-times.png",
  "Washington Post": "/source-logos/washington-post.png",
  TMZ: "/source-logos/tmz.png",
  "NBC News": "/source-logos/nbc.png",
  "CBS News": "/source-logos/cbs.png",
  Bloomberg: "/source-logos/bloomberg.png",
  Politico: "/source-logos/politico.png",
  "The Hill": "/source-logos/the-hill.png",
  "The Guardian": "/source-logos/the-guardian.png",
  NPR: "/source-logos/npr.png",
  Axios: "/source-logos/axios.png",
  Newsmax: "/source-logos/newsmax.png",
  MSNBC: "/source-logos/msnbc.png",
  ESPN: "/source-logos/espn.png",
  "ABC News": "/source-logos/abc.png",
  "Al Jazeera": "/source-logos/al-jazeera.png",
  "Al Jazeera English": "/source-logos/al-jazeera.png",
};

export function normalizeSourceLogoName(sourceName: string) {
  return sourceName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function getSourceLogoUrl(sourceName: string) {
  const mappedLogo = SOURCE_LOGO_MAP[sourceName];

  if (mappedLogo) {
    return mappedLogo;
  }

  const normalized = normalizeSourceLogoName(sourceName);

  if (!normalized) {
    return null;
  }

  // Source logos are loaded from local assets in /public/source-logos.
  // We prefer SOURCE_LOGO_MAP for known publisher naming mismatches, then
  // fall back to a normalized filename guess. If the file is missing, the UI
  // falls back to the in-app letter badge so Reflekt never renders a broken image box.
  return `/source-logos/${normalized}.png`;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
