export const sourceLogoMap: Record<string, string> = {
  CNN: "/source-logos/cnn.png",
  "BBC News": "/source-logos/bbc.png",
  CNBC: "/source-logos/cnbc.png",
  "Fox News": "/source-logos/fox-news.png",
  "Associated Press": "/source-logos/ap-news.png",
  "AP News": "/source-logos/ap-news.png",
  Reuters: "/source-logos/reuters.png",
  "The New York Times": "/source-logos/the-new-york-times.png",
  "The Washington Post": "/source-logos/washinton-post.png",
  "Washington Post": "/source-logos/washinton-post.png",
  TMZ: "/source-logos/tmz.png",
  "NBC News": "/source-logos/nbc-news.png",
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
  "Business Insider": "/source-logos/business-insider.png",
  HuffPost: "/source-logos/huffpost.png",
  IGN: "/source-logos/ign.png",
  "New York Post": "/source-logos/new-york-post.png",
  "9to5Mac": "/source-logos/nine-to-five-mac.png",
  Variety: "/source-logos/variety.png",
  Wired: "/source-logos/wired.png",
  "The Wall Street Journal": "/source-logos/the-wallstreet-journal.png",
  "Wall Street Journal": "/source-logos/the-wallstreet-journal.png",
  "The Seattle Times": "/source-logos/the-seattle-times.png",
  "Seattle Times": "/source-logos/the-seattle-times.png",
};

const confirmedLocalLogoPaths = new Set([
  "/source-logos/abc.png",
  "/source-logos/al-jazeera.png",
  "/source-logos/ap-news.png",
  "/source-logos/axios.png",
  "/source-logos/bbc.png",
  "/source-logos/bloomberg.png",
  "/source-logos/business-insider.png",
  "/source-logos/cbs.png",
  "/source-logos/cnn.png",
  "/source-logos/espn.png",
  "/source-logos/fox-news.png",
  "/source-logos/huffpost.png",
  "/source-logos/ign.png",
  "/source-logos/msnbc.png",
  "/source-logos/nbc-news.png",
  "/source-logos/new-york-post.png",
  "/source-logos/newsmax.png",
  "/source-logos/nine-to-five-mac.png",
  "/source-logos/npr.png",
  "/source-logos/politico.png",
  "/source-logos/reuters.png",
  "/source-logos/the-guardian.png",
  "/source-logos/the-hill.png",
  "/source-logos/the-new-york-times.png",
  "/source-logos/the-seattle-times.png",
  "/source-logos/the-wallstreet-journal.png",
  "/source-logos/tmz.png",
  "/source-logos/variety.png",
  "/source-logos/washinton-post.png",
  "/source-logos/wired.png",
]);

export function normalizeSourceLogoName(sourceName: string) {
  return sourceName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function slugifySourceName(sourceName: string) {
  return sourceName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function getSourceNameFromSlug(sourceSlug: string) {
  const normalizedSlug = sourceSlug.trim().toLowerCase();
  const knownSource = Object.keys(sourceLogoMap).find(
    (sourceName) => slugifySourceName(sourceName) === normalizedSlug
  );

  if (knownSource) {
    return knownSource;
  }

  return normalizedSlug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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
