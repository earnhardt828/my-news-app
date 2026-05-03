export type VideoItem = {
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
  category: string;
  orientation: "vertical" | "horizontal";
  views: number;
  likes: number;
  comments: number;
  saved: boolean;
  liked: boolean;
  theme: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  watchUrl: string;
  embedUrl: string;
  fallback: boolean;
};

export type VideoApiItem = Omit<VideoItem, "saved" | "liked" | "theme"> & {
  saved?: boolean;
  liked?: boolean;
  theme?: string | null;
};

export function getVideoCommentArticleId(videoId: string) {
  let hash = 0;

  for (let index = 0; index < videoId.length; index += 1) {
    hash = (hash * 31 + videoId.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
}

export function extractVideoIdFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\/+/, "").trim() || null;
    }

    return null;
  } catch {
    return null;
  }
}

export const initialVideos: VideoItem[] = [
  {
    id: "fallback-1",
    youtubeId: "fallback-1",
    title: "Morning markets in 60 seconds",
    creator: "Graffiti Business",
    category: "Business",
    orientation: "horizontal",
    views: 18400,
    likes: 248,
    comments: 36,
    saved: false,
    liked: false,
    theme: "video-card-theme-rose",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
  {
    id: "fallback-2",
    youtubeId: "fallback-2",
    title: "Tech launch recap from today",
    creator: "Graffiti Tech",
    category: "Tech",
    orientation: "horizontal",
    views: 26300,
    likes: 391,
    comments: 51,
    saved: true,
    liked: true,
    theme: "video-card-theme-ink",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
  {
    id: "fallback-3",
    youtubeId: "fallback-3",
    title: "World headlines quick rundown",
    creator: "Graffiti World",
    category: "World",
    orientation: "horizontal",
    views: 14200,
    likes: 172,
    comments: 19,
    saved: false,
    liked: false,
    theme: "video-card-theme-sunset",
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
];

export function formatVideoPublishedDate(publishedAt: string | null) {
  if (!publishedAt) {
    return "Recent";
  }

  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function cleanVideoTitle(title: string | null | undefined) {
  const fallbackTitle = "Latest news update";

  if (!title) {
    return fallbackTitle;
  }

  const decodedTitle = decodeHtmlEntities(title);
  const normalizedWhitespace = decodedTitle.replace(/\s+/g, " ").trim();
  const apostropheFixedTitle = normalizedWhitespace
    .replace(/(\w)\s*39\s*(\w)/g, "$1'$2")
    .replace(/\b39(?=s\b)/gi, "'")
    .replace(/\b39\b/g, " ");
  const cleanedTitle = apostropheFixedTitle
    .replace(/\s{2,}/g, " ")
    .replace(/^[\W_]+|[\W_]+$/g, "")
    .trim();

  if (cleanedTitle.length < 6 || !/[A-Za-z]/.test(cleanedTitle)) {
    return fallbackTitle;
  }

  return cleanedTitle;
}

export function buildVideoEmbedUrl(youtubeId: string, autoplay: boolean) {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${youtubeId}`);
  url.searchParams.set("autoplay", autoplay ? "1" : "0");
  url.searchParams.set("mute", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("controls", "0");
  url.searchParams.set("rel", "0");
  url.searchParams.set("modestbranding", "1");
  return url.toString();
}

export function inferVideoOrientation(
  width?: number | null,
  height?: number | null
) {
  if (width && height) {
    return height > width ? "vertical" : "horizontal";
  }

  return "horizontal";
}

export function normalizeVideoFeedItems(videos?: VideoApiItem[]) {
  const themes = [
    "video-card-theme-rose",
    "video-card-theme-ink",
    "video-card-theme-sunset",
  ];

  return (videos ?? initialVideos).map((video, index) => ({
    ...video,
    title: cleanVideoTitle(video.title),
    saved: video.saved ?? false,
    liked: video.liked ?? false,
    theme: video.theme ?? themes[index % themes.length],
  }));
}
