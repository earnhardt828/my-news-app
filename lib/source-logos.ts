export const sourceLogoMap: Record<string, string> = {
  CNN: "/source-logos/cnn.png",
  "BBC News": "/source-logos/bbc.png",
  CNBC: "/source-logos/cnbc.png",
  "Fox News": "/source-logos/fox-news.png",
  "Associated Press": "/source-logos/ap-news.png",
  "AP News": "/source-logos/ap-news.png",
  Reuters: "/source-logos/reuters.png",
  "The New York Times": "/source-logos/the-new-york-times.png",
  "The Washington Post": "/source-logos/washington-post.png",
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

const confirmedLocalLogoPaths = new Set([
  "/source-logos/abc.png",
  "/source-logos/al-jazeera.png",
  "/source-logos/ap-news.png",
  "/source-logos/axios.png",
  "/source-logos/bbc.png",
  "/source-logos/bloomberg.png",
  "/source-logos/cbs.png",
  "/source-logos/cnn.png",
  "/source-logos/espn.png",
  "/source-logos/fox-news.png",
  "/source-logos/huffpost.png",
  "/source-logos/ign.png",
]);

export function normalizeSourceLogoName(sourceName: string) {
  return sourceName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function getSourceLogoUrl(sourceName: string) {
  const trimmedSourceName = sourceName.trim();
  const mappedLogo = sourceLogoMap[trimmedSourceName];

  if (mappedLogo && confirmedLocalLogoPaths.has(mappedLogo)) {
    return mappedLogo;
  }

  const normalized = normalizeSourceLogoName(trimmedSourceName);

  if (!normalized) {
    return null;
  }

  // Source logos are loaded from local assets in /public/source-logos.
  // We prefer SOURCE_LOGO_MAP for known publisher naming mismatches, then
  // fall back to a normalized filename guess. If the file is missing, the UI
  // falls back to the in-app letter badge so Reflekt never renders a broken image box.
  const normalizedPath = `/source-logos/${normalized}.png`;

  return confirmedLocalLogoPaths.has(normalizedPath) ? normalizedPath : null;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
