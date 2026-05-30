type ApprovedChannel = {
  channelId: string;
  name: string;
};

import {
  getPoliticsVideoScore,
  getTechnologyVideoScore,
  getWorldVideoScore,
  isStrictPoliticsVideo,
  isStrictTechnologyVideo,
  isStrictWorldVideo,
} from "../../../lib/video-filters";

type RssFeedEntry = {
  videoId: string;
  title: string;
  creator: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
};

type YouTubeSearchResult = {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string; width?: number; height?: number };
      medium?: { url?: string; width?: number; height?: number };
      default?: { url?: string; width?: number; height?: number };
    };
  };
};

type VideoFeedItem = {
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
  category: string;
  orientation: "vertical" | "horizontal";
  views: number;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  watchUrl: string;
  embedUrl: string;
  fallback: boolean;
};

type VideoFeedTab = "all" | "news" | "world" | "politics" | "sports" | "celebrity" | "technology";
type WeatherCapableVideoFeedTab = VideoFeedTab | "weather";
const WORLD_TAB_SEARCH_QUERIES = [
  "world news latest",
  "international news latest",
  "BBC World News",
  "Reuters world news",
  "AP international news",
  "CNN international",
  "Al Jazeera English world news",
  "DW News world",
  "France 24 English",
  "Sky News world",
  "United Nations news",
  "global conflict news",
  "Europe news",
  "Middle East news",
  "Asia news",
  "Africa news",
] as const;
const POLITICS_TAB_SEARCH_QUERIES = [
  "politics latest",
  "White House latest",
  "Congress latest",
  "election latest",
  "Supreme Court latest",
  "PBS NewsHour politics",
  "CNN politics",
  "Fox News politics",
  "NBC News politics",
  "ABC News politics",
  "CBS News politics",
  "Politico video",
] as const;
const TECHNOLOGY_TAB_SEARCH_QUERIES = [
  "tech news",
  "technology news",
  "AI news",
  "artificial intelligence news",
  "Apple technology",
  "Google AI",
  "Microsoft AI",
  "OpenAI news",
  "Nvidia AI",
  "cybersecurity news",
  "gadget news",
  "semiconductor news",
  "software news",
  "startup news",
] as const;

function buildFallbackVideosForTab(tab: WeatherCapableVideoFeedTab): VideoFeedItem[] {
  const common = {
    views: 0,
    likes: 0,
    comments: 0,
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  } satisfies Pick<
    VideoFeedItem,
    "views" | "likes" | "comments" | "thumbnailUrl" | "publishedAt" | "watchUrl" | "embedUrl" | "fallback"
  >;

  if (tab === "sports") {
    return [
      {
        id: "sports-fallback-1",
        youtubeId: "sports-fallback-1",
        title: "Top sports highlights roundup",
        creator: "ESPN",
        category: "Sports",
        orientation: "vertical",
        ...common,
      },
      {
        id: "sports-fallback-2",
        youtubeId: "sports-fallback-2",
        title: "Game-winning plays from around the leagues",
        creator: "Bleacher Report",
        category: "Sports",
        orientation: "vertical",
        ...common,
      },
      {
        id: "sports-fallback-3",
        youtubeId: "sports-fallback-3",
        title: "Latest scores and sports updates",
        creator: "Yahoo Sports",
        category: "Sports",
        orientation: "horizontal",
        ...common,
      },
    ];
  }

  if (tab === "celebrity") {
    return [
      {
        id: "celeb-fallback-1",
        youtubeId: "celeb-fallback-1",
        title: "Celebrity headlines and entertainment updates",
        creator: "People",
        category: "Entertainment",
        orientation: "vertical",
        ...common,
      },
      {
        id: "celeb-fallback-2",
        youtubeId: "celeb-fallback-2",
        title: "Hollywood red carpet recap",
        creator: "Entertainment Tonight",
        category: "Entertainment",
        orientation: "vertical",
        ...common,
      },
      {
        id: "celeb-fallback-3",
        youtubeId: "celeb-fallback-3",
        title: "Music, movies, and TV buzz",
        creator: "Variety",
        category: "Entertainment",
        orientation: "horizontal",
        ...common,
      },
    ];
  }

  if (tab === "technology") {
    return [];
  }

  if (tab === "world") {
    return [];
  }

  if (tab === "weather") {
    return [
      {
        id: "weather-fallback-1",
        youtubeId: "weather-fallback-1",
        title: "National weather forecast update",
        creator: "The Weather Channel",
        category: "Weather",
        orientation: "horizontal",
        ...common,
      },
      {
        id: "weather-fallback-2",
        youtubeId: "weather-fallback-2",
        title: "Storm tracker and radar outlook",
        creator: "Fox Weather",
        category: "Weather",
        orientation: "horizontal",
        ...common,
      },
      {
        id: "weather-fallback-3",
        youtubeId: "weather-fallback-3",
        title: "Forecast and severe weather watch",
        creator: "AccuWeather",
        category: "Weather",
        orientation: "horizontal",
        ...common,
      },
    ];
  }

  return [
    {
      id: "news-fallback-1",
      youtubeId: "news-fallback-1",
      title: "Top headlines right now",
      creator: "Reuters",
      category: "Trending",
      orientation: "vertical",
      ...common,
    },
    {
      id: "news-fallback-2",
      youtubeId: "news-fallback-2",
      title: "Latest world and U.S. news roundup",
      creator: "NBC News",
      category: "Trending",
      orientation: "vertical",
      ...common,
    },
    {
      id: "news-fallback-3",
      youtubeId: "news-fallback-3",
      title: "Business, politics, and breaking updates",
      creator: "CBS News",
      category: "Trending",
      orientation: "horizontal",
      ...common,
    },
    {
      id: "news-fallback-4",
      youtubeId: "news-fallback-4",
      title: "Evening headlines in under a minute",
      creator: "ABC News",
      category: "Trending",
      orientation: "vertical",
      ...common,
    },
    {
      id: "news-fallback-5",
      youtubeId: "news-fallback-5",
      title: "Fast news briefing",
      creator: "PBS NewsHour",
      category: "Trending",
      orientation: "horizontal",
      ...common,
    },
  ];
}

const SPORTS_POSITIVE_PATTERN =
  /(sports|espn|sportscenter|nfl|nba|mlb|nhl|mls|soccer|football|basketball|baseball|hockey|golf|tennis|nascar|formula 1|formula1|f1|ufc|mma|highlights?|touchdown|dunk|home run|goals?|save|replay|top plays|bleacher report|fox sports|cbs sports|nbc sports|sports illustrated|pga|masters|grand prix|race winner)/;

const SPORTS_REJECTED_PATTERN =
  /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress)/;

const CELEBRITY_POSITIVE_PATTERN =
  /(celebrity|celebrities|entertainment|e! news|entertainment tonight|tmz|people|page six|access hollywood|extra|red carpet|hollywood|actor|actress|singer|musician|movie star|tv star|billboard|variety|the hollywood reporter|deadline|film premiere|movie trailer|tv show|streaming series|album release|box office|festival|gossip|paparazzi|interview)/;

const CELEBRITY_REJECTED_PATTERN =
  /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress|sportscenter|touchdown|dunk|home run|goal|nfl|nba|mlb|nhl|mls|market|stocks|finance|policy|senate|president|breaking news|world news|flood|earthquake|shooting|inflation|tariffs)/;
const WEATHER_POSITIVE_PATTERN =
  /(weather|storm|tornado|hurricane|rain|snow|flooding|wildfire|radar|forecast|climate|severe weather|the weather channel|fox weather|accuweather|noaa|national weather service|cnn weather|storm tracker|storm surge|heat wave|blizzard)/;
const WEATHER_REJECTED_PATTERN =
  /(politics|election|economy|stocks|market|crime|celebrity|red carpet|hollywood|sportscenter|touchdown|dunk|home run|goal|nfl|nba|mlb|nhl|mls|war|white house|congress|president|music awards)/;
const BLOCKED_VIDEO_SOURCE_PATTERN = /\b(kanak news|kanak news odisha)\b/i;
const BLOCKED_VIDEO_URL_PATTERN = /kanaknews\.com/i;
const YOUTUBE_API_KEY =
  process.env.YOUTUBE_API_KEY ?? process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ?? "";

const APPROVED_CHANNELS: ApprovedChannel[] = [
  { channelId: "UCiWLfSweyRNmLpgEHekhoAg", name: "ESPN" },
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News" },
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN" },
  { channelId: "UCXIJgqnII2ZOINSWNOGFThA", name: "Fox News" },
  { channelId: "UCeY0bbntWzzVIaj2z3QigXg", name: "NBC News" },
  { channelId: "UC8p1vwvWtl6T73JiExfWs1g", name: "CBS News" },
  { channelId: "UC6ZFN9Tx6xh-skXCuRHCDpQ", name: "PBS NewsHour" },
  { channelId: "UCrp_UI8XtuYfpiqluWLD7Lw", name: "CNBC" },
  { channelId: "UCUMZ7gohGI9HcU9VNsr2FJQ", name: "Bloomberg" },
  { channelId: "UChqUTb7kYRX8-EiaN3XFrSQ", name: "Reuters" },
  { channelId: "UC52X5wxOL_s5yw0dQk7NtgA", name: "Associated Press" },
  { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", name: "ABC News" },
  { channelId: "UCoMdktPbSTixAyNGwb-UYkQ", name: "Sky News" },
  { channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", name: "Al Jazeera English" },
  { channelId: "UCGTUbwceCMibvpbd2NaIP7A", name: "The Weather Channel" },
  { channelId: "UCJRTDulllTmEvB3dJFxXP3Q", name: "Fox Weather" },
  { channelId: "UC-RxXi2Xws6Uk22vp-sLbGA", name: "WCNC Charlotte" },
  { channelId: "UC6YN4FNhAKN3MDO5DbJSnOA", name: "Queen City News" },
];

const FALLBACK_VIDEOS: VideoFeedItem[] = [
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
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
];

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractXmlTag(block: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function extractThumbnail(block: string) {
  const match = block.match(/<media:thumbnail\b([^>]*)\/?>/i);

  if (!match) {
    return {
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
    };
  }

  const attrs = match[1];
  const url = attrs.match(/\burl="([^"]+)"/i)?.[1] ?? null;
  const width = attrs.match(/\bwidth="(\d+)"/i)?.[1] ?? null;
  const height = attrs.match(/\bheight="(\d+)"/i)?.[1] ?? null;

  return {
    thumbnailUrl: url,
    thumbnailWidth: width ? Number(width) : null,
    thumbnailHeight: height ? Number(height) : null,
  };
}

function inferVideoCategory(title: string, creator: string, fallbackCategory?: string | null) {
  if (fallbackCategory && fallbackCategory !== "Trending") {
    return fallbackCategory;
  }

  const haystack = `${title} ${creator}`.toLowerCase();

  if (/(breaking|urgent|developing|live updates|alert)/.test(haystack)) {
    return "Breaking News";
  }

  if (/(election|senate|white house|policy|president|campaign|government|politic)/.test(haystack)) {
    return "Politics";
  }

  if (/(market|economy|stock|business|trade|jobs|finance|inflation)/.test(haystack)) {
    return /(bank|wall street|invest|fund|earnings|interest rate|bond|nasdaq|dow)/.test(haystack)
      ? "Finance"
      : "Business";
  }

  if (/(world|global|international|ukraine|gaza|europe|asia|middle east|foreign)/.test(haystack)) {
    return "World";
  }

  if (/(sport|nfl|nba|mlb|fifa|soccer|tennis|golf|olympic)/.test(haystack)) {
    return "Sports";
  }

  if (/(tech|ai|apple|google|meta|microsoft|startup|app|software|chip)/.test(haystack)) {
    return "Tech";
  }

  if (/(movie|music|celebrity|show|entertainment|hollywood|tv)/.test(haystack)) {
    return "Entertainment";
  }

  if (/(health|medical|disease|covid|hospital|doctor|wellness)/.test(haystack)) {
    return "Health";
  }

  if (/(science|space|climate|nasa|research|study|physics)/.test(haystack)) {
    return "Science";
  }

  if (/(storm|forecast|temperature|hurricane|tornado|rain|snow|wildfire|weather)/.test(haystack)) {
    return "Weather";
  }

  if (/(crime|police|court|arrest|trial|shooting|murder|suspect|lawsuit)/.test(haystack)) {
    return "Crime";
  }

  if (/(school|student|teacher|college|university|education|campus)/.test(haystack)) {
    return "Education";
  }

  if (/(housing|mortgage|home sales|property|real estate|rent)/.test(haystack)) {
    return "Real Estate";
  }

  if (/(travel|airport|airline|vacation|tourism|hotel)/.test(haystack)) {
    return "Travel";
  }

  if (/(food|restaurant|chef|recipe|dining)/.test(haystack)) {
    return "Food";
  }

  if (/(culture|art|museum|book|festival)/.test(haystack)) {
    return "Culture";
  }

  if (/(lifestyle|fashion|style|wellbeing|relationship)/.test(haystack)) {
    return "Lifestyle";
  }

  if (/(opinion|analysis|editorial|column)/.test(haystack)) {
    return "Opinion";
  }

  if (/(local|city hall|community|county|neighborhood|state fair)/.test(haystack)) {
    return "Local News";
  }

  return "Trending";
}

function inferVideoOrientation(
  width?: number | null,
  height?: number | null,
  options?: {
    title?: string | null;
    thumbnailUrl?: string | null;
    watchUrl?: string | null;
  }
) {
  const orientationHint = `${options?.title ?? ""} ${options?.thumbnailUrl ?? ""} ${
    options?.watchUrl ?? ""
  }`.toLowerCase();

  if (/(^|\W)(shorts?|reels?|tiktok)(\W|$)/.test(orientationHint)) {
    return "vertical";
  }

  if (width && height) {
    return height > width ? "vertical" : "horizontal";
  }

  return "horizontal";
}

function getVideoTimestamp(publishedAt: string | null | undefined) {
  if (!publishedAt) {
    return 0;
  }

  const timestamp = new Date(publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getVideoSearchHaystack(video: Pick<VideoFeedItem, "title" | "creator" | "category">) {
  return `${video.title} ${video.creator} ${video.category}`.toLowerCase();
}

function normalizeVideoSourceName(source: string) {
  const normalized = source.trim().toLowerCase();

  if (normalized === "associated press" || normalized === "ap news") {
    return "ap";
  }

  return normalized;
}

function normalizeVideoTitleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSportsVideoScore(video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">) {
  const haystack = getVideoSearchHaystack(video);
  let score = 0;

  if (!isStrictSportsVideo(video)) {
    return -1000;
  }

  if (
    /(highlights?|top plays|touchdown|dunk|home run|goals?|save|replay|buzzer beater|walk off|slam dunk|game winner)/.test(
      haystack
    )
  ) {
    score += 180;
  }

  if (
    /(sportscenter top plays|espn highlights|nba highlights|nfl highlights|mlb highlights|nhl highlights|mls highlights|soccer goals highlights|cbs sports highlights|bleacher report highlights|fox sports highlights|pga tour highlights|nascar highlights|formula 1 highlights|f1 highlights)/.test(
      haystack
    )
  ) {
    score += 150;
  }

  if (
    /(espn|sportscenter|nba|nfl|mlb|nhl|mls|soccer|goal|golf|tennis|nascar|formula 1|formula1|f1|ufc|mma|bleacher report|cbs sports|fox sports|nbc sports|sports illustrated|pga)/.test(
      haystack
    )
  ) {
    score += 95;
  }

  if (video.category === "Sports") {
    score += 80;
  }

  if (video.orientation === "vertical") {
    score += 64;
  }

  if (/(debate|podcast|interview|rumors?|preview|reaction)/.test(haystack)) {
    score -= 140;
  }

  return score;
}

function getNewsVideoScore(video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">) {
  const haystack = getVideoSearchHaystack(video);
  let score = 0;

  if (/(breaking news|live updates|developing story|just in|urgent|latest news)/.test(haystack)) {
    score += 140;
  }

  if (/(news|report|coverage|alert|update|headline|explainer)/.test(haystack)) {
    score += 48;
  }

  if (/(cnn|reuters|associated press|ap news|abc news|nbc news|cbs news|pbs newshour|bbc news|bloomberg|cnbc|guardian|usa today)/.test(haystack)) {
    score += 84;
  }

  if (/(al jazeera|fox news)/.test(haystack)) {
    score -= 24;
  }

  if (/(overlay|end screen|info card|subscribe)/.test(haystack)) {
    score -= 40;
  }

  if (video.category !== "Sports") {
    score += 30;
  }

  if (video.orientation === "vertical") {
    score += 24;
  }

  score -= Math.max(0, getSportsVideoScore(video));

  return score;
}

function isStrictCelebrityVideo(
  video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">
) {
  const haystack = getVideoSearchHaystack(video);
  const creator = video.creator.toLowerCase();
  const title = video.title.toLowerCase();
  const approvedEntertainmentSource =
    /(e! news|entertainment tonight|tmz|people|page six|billboard|variety|the hollywood reporter|deadline|access hollywood|extra|us weekly|entertainment weekly)/.test(
      creator
    );
  const generalNewsSource =
    /(cnn|fox news|reuters|associated press|ap news|abc news|nbc news|cbs news|pbs newshour|sky news|al jazeera|bloomberg|cnbc|guardian|usa today|bbc news)/.test(
      creator
    );
  const titleHasClearCelebrityTerms =
    /(celebrity|celebrities|red carpet|hollywood|actor|actress|singer|musician|movie star|tv star|film premiere|movie trailer|tv show|streaming series|album release|box office|festival|gossip|paparazzi|celebrity interview|entertainment tonight)/.test(
      title
    );
  const hasCelebrityTerms = CELEBRITY_POSITIVE_PATTERN.test(haystack);
  const hasRejectedTerms = CELEBRITY_REJECTED_PATTERN.test(haystack);

  if (hasRejectedTerms || !hasCelebrityTerms) {
    return false;
  }

  if (approvedEntertainmentSource) {
    return true;
  }

  if (generalNewsSource) {
    return titleHasClearCelebrityTerms;
  }

  return titleHasClearCelebrityTerms || video.category === "Entertainment";
}

function getCelebrityVideoScore(
  video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">
) {
  const haystack = getVideoSearchHaystack(video);
  let score = 0;

  if (!isStrictCelebrityVideo(video)) {
    return -1000;
  }

  if (
    /(e! news|entertainment tonight|people|tmz|page six|access hollywood|extra|billboard|variety|deadline|the hollywood reporter|red carpet|movie trailer|celebrity interview|festival premiere|album release)/.test(
      haystack
    )
  ) {
    score += 160;
  }

  if (/(celebrity|hollywood|entertainment|music|movie|tv|gossip|interview)/.test(haystack)) {
    score += 90;
  }

  if (video.category === "Entertainment") {
    score += 72;
  }

  if (video.orientation === "vertical") {
    score += 52;
  }

  if (/(podcast|debate|reaction|recap only|full press conference)/.test(haystack)) {
    score -= 120;
  }

  return score;
}

function isStrictWeatherVideo(
  video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">
) {
  const haystack = getVideoSearchHaystack(video);
  return WEATHER_POSITIVE_PATTERN.test(haystack) && !WEATHER_REJECTED_PATTERN.test(haystack);
}

function getWeatherVideoScore(
  video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">
) {
  const haystack = getVideoSearchHaystack(video);
  let score = 0;

  if (!isStrictWeatherVideo(video)) {
    return -1000;
  }

  if (
    /(the weather channel|fox weather|accuweather|noaa|national weather service|cnn weather)/.test(
      haystack
    )
  ) {
    score += 180;
  }

  if (
    /(severe weather|hurricane|tornado|storm|storm surge|flooding|wildfire|radar|forecast|blizzard|heat wave|storm tracker)/.test(
      haystack
    )
  ) {
    score += 130;
  }

  if (video.category === "Weather") {
    score += 80;
  }

  if (video.orientation === "vertical") {
    score += 48;
  }

  if (/(podcast|debate|reaction|recap only|full press conference)/.test(haystack)) {
    score -= 120;
  }

  return score;
}

function isBlockedVideo(video: Pick<VideoFeedItem, "title" | "creator" | "watchUrl">) {
  const haystack = `${video.title} ${video.creator} ${video.watchUrl}`;
  return (
    BLOCKED_VIDEO_SOURCE_PATTERN.test(haystack) || BLOCKED_VIDEO_URL_PATTERN.test(video.watchUrl)
  );
}

function isStrictSportsVideo(
  video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">
) {
  const haystack = getVideoSearchHaystack(video);

  const hasSportsTerms =
    SPORTS_POSITIVE_PATTERN.test(
      haystack
    ) || video.category === "Sports";

  const hasRejectedTerms =
    SPORTS_REJECTED_PATTERN.test(haystack);

  return hasSportsTerms && !hasRejectedTerms;
}

function diversifyVideoSources(videos: VideoFeedItem[], maxPerSource = 2) {
  const selected: VideoFeedItem[] = [];
  const overflow: VideoFeedItem[] = [];
  const sourceCounts = new Map<string, number>();

  videos.forEach((video) => {
    const normalizedSource = normalizeVideoSourceName(video.creator);
    const currentCount = sourceCounts.get(normalizedSource) ?? 0;

    if (currentCount < maxPerSource) {
      selected.push(video);
      sourceCounts.set(normalizedSource, currentCount + 1);
      return;
    }

    overflow.push(video);
  });

  return [...selected, ...overflow];
}

function dedupeVideoItems(videos: VideoFeedItem[]) {
  return Array.from(
    new Map(
      videos.map((video) => [
        [
          video.youtubeId,
          normalizeVideoTitleKey(video.title),
          normalizeVideoSourceName(video.creator),
          video.watchUrl,
        ].join("::"),
        video,
      ])
    ).values()
  );
}

function dedupeEntriesByVideoId(entries: RssFeedEntry[]) {
  return Array.from(new Map(entries.map((entry) => [entry.videoId, entry])).values());
}

function getPublishedAfterIso(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function normalizeForSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearchTerm(haystack: string, searchTerm: string) {
  const normalizedHaystack = normalizeForSearch(haystack);
  const normalizedSearch = normalizeForSearch(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  if (normalizedHaystack.includes(normalizedSearch)) {
    return true;
  }

  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  const matchingTokenCount = tokens.filter((token) => normalizedHaystack.includes(token)).length;
  return matchingTokenCount >= Math.max(2, Math.ceil(tokens.length * 0.6));
}

function buildRssFeedUrl(channelId: string) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

async function fetchVideosForSearchQuery(searchTerm: string) {
  if (!YOUTUBE_API_KEY || !searchTerm.trim()) {
    return [] as RssFeedEntry[];
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "16");
  searchUrl.searchParams.set("q", searchTerm);
  searchUrl.searchParams.set("safeSearch", "moderate");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const response = await fetch(searchUrl.toString(), {
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`YouTube Data API search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    items?: YouTubeSearchResult[];
  };

  return (payload.items ?? [])
    .map((item): RssFeedEntry | null => {
      const videoId = item.id?.videoId?.trim();
      const snippet = item.snippet;
      const title = snippet?.title?.trim();
      const creator = snippet?.channelTitle?.trim() ?? "";
      const thumbnail =
        snippet?.thumbnails?.high ?? snippet?.thumbnails?.medium ?? snippet?.thumbnails?.default;

      if (!videoId || !title) {
        return null;
      }

      return {
        videoId,
        title,
        creator,
        publishedAt: snippet?.publishedAt ?? null,
        thumbnailUrl: thumbnail?.url ?? null,
        thumbnailWidth: thumbnail?.width ?? null,
        thumbnailHeight: thumbnail?.height ?? null,
      };
    })
    .filter((entry): entry is RssFeedEntry => entry !== null);
}

async function fetchVideosForChannel(channel: ApprovedChannel) {
  const response = await fetch(buildRssFeedUrl(channel.channelId), {
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`RSS feed request failed for ${channel.name} (${response.status})`);
  }

  const xml = await response.text();
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

  return entryBlocks
    .map((entry): RssFeedEntry | null => {
      const videoId = extractXmlTag(entry, "yt:videoId");
      const title = extractXmlTag(entry, "title");
      const creator = extractXmlTag(entry, "name") ?? channel.name;
      const publishedAt = extractXmlTag(entry, "published");
      const { thumbnailUrl, thumbnailWidth, thumbnailHeight } = extractThumbnail(entry);

      if (!videoId || !title) {
        return null;
      }

      return {
        videoId,
        title,
        creator,
        publishedAt,
        thumbnailUrl,
        thumbnailWidth,
        thumbnailHeight,
      };
    })
    .filter((entry): entry is RssFeedEntry => entry !== null);
}

function filterAndSortVideos(
  entries: RssFeedEntry[],
  options: {
    category: string;
    searchTerm: string;
    tab: WeatherCapableVideoFeedTab;
  }
) {
  const normalizedSearch = normalizeForSearch(options.searchTerm);
  const isTrendingFeed = options.category === "Trending" && normalizedSearch.length === 0;

  const mappedVideos = entries.map((entry) => {
    const inferredCategory = inferVideoCategory(
      entry.title,
      entry.creator,
      options.category
    );

    return {
      id: entry.videoId,
      youtubeId: entry.videoId,
      title: entry.title,
      creator: entry.creator,
      category: inferredCategory,
      orientation: inferVideoOrientation(
        entry.thumbnailWidth,
        entry.thumbnailHeight,
        {
          title: entry.title,
          thumbnailUrl: entry.thumbnailUrl,
          watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
        }
      ),
      views: 0,
      likes: 0,
      comments: 0,
      thumbnailUrl: entry.thumbnailUrl,
      publishedAt: entry.publishedAt,
      watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}?autoplay=1`,
      fallback: false,
    } satisfies VideoFeedItem;
  });
  const nonBlockedVideos = mappedVideos.filter((video) => !isBlockedVideo(video));

  const searchFiltered = normalizedSearch
    ? nonBlockedVideos.filter((video) => {
        const haystack = `${video.title} ${video.creator} ${video.category}`;
        return matchesSearchTerm(haystack, normalizedSearch);
      })
    : nonBlockedVideos;

  const categoryFiltered =
    options.category !== "Trending"
      ? searchFiltered.filter((video) => video.category === options.category)
      : searchFiltered;

  const tabFiltered =
    options.tab === "sports"
      ? categoryFiltered.filter((video) => isStrictSportsVideo(video))
      : options.tab === "world"
        ? categoryFiltered.filter((video) => isStrictWorldVideo(video))
      : options.tab === "politics"
        ? categoryFiltered.filter((video) => isStrictPoliticsVideo(video))
      : options.tab === "celebrity"
        ? categoryFiltered.filter((video) => isStrictCelebrityVideo(video))
      : options.tab === "technology"
        ? categoryFiltered.filter((video) => isStrictTechnologyVideo(video))
      : options.tab === "news"
        ? categoryFiltered.filter(
            (video) =>
              getSportsVideoScore(video) < 120 &&
              getWeatherVideoScore(video) < 120 &&
              (getNewsVideoScore(video) > 0 || video.category !== "Sports")
          )
      : options.tab === "weather"
        ? categoryFiltered.filter((video) => isStrictWeatherVideo(video))
      : categoryFiltered;

  const minimumTargetCount = options.tab === "news" ? 5 : options.tab === "all" ? 5 : 3;
  const relaxedTabFiltered =
    tabFiltered.length >= minimumTargetCount
      ? tabFiltered
      : categoryFiltered.filter((video) => {
          const haystack = getVideoSearchHaystack(video);

          if (options.tab === "sports") {
            return !SPORTS_REJECTED_PATTERN.test(haystack) &&
              /(sports|espn|bleacher report|mlb|nhl|nba|nfl|mls|soccer|football|basketball|baseball|hockey|motorsport|nascar|formula 1|golf|tennis|ufc|mma|highlights?|top plays|touchdown|dunk|home run|goal|save|replay)/.test(
                haystack
              );
          }

          if (options.tab === "celebrity") {
            return !CELEBRITY_REJECTED_PATTERN.test(haystack) &&
              /(celebrity|entertainment|hollywood|red carpet|actor|actress|singer|musician|movie|tv|gossip|variety|people|tmz|page six|access hollywood|extra|billboard|deadline)/.test(
                haystack
              );
          }

          if (options.tab === "weather") {
            return !WEATHER_REJECTED_PATTERN.test(haystack) &&
              /(weather|storm|tornado|hurricane|rain|snow|flood|wildfire|radar|forecast|climate|the weather channel|fox weather|accuweather|noaa|national weather service)/.test(
                haystack
              );
          }

          if (options.tab === "technology") {
            return isStrictTechnologyVideo(video);
          }

          if (options.tab === "news") {
            return !isStrictSportsVideo(video) && !isStrictCelebrityVideo(video) && !isStrictWeatherVideo(video);
          }

          return true;
        });

  const deduped = dedupeVideoItems(
    options.tab === "technology" || options.tab === "politics" || options.tab === "world"
      ? tabFiltered
      : tabFiltered.length >= minimumTargetCount
        ? tabFiltered
        : [...tabFiltered, ...relaxedTabFiltered]
  );

  deduped.sort((a, b) => {
    const scoreDelta =
      options.tab === "sports"
        ? getSportsVideoScore(b) - getSportsVideoScore(a)
        : options.tab === "politics"
          ? getPoliticsVideoScore(b) - getPoliticsVideoScore(a)
        : options.tab === "world"
          ? getWorldVideoScore(b) - getWorldVideoScore(a)
        : options.tab === "celebrity"
          ? getCelebrityVideoScore(b) - getCelebrityVideoScore(a)
        : options.tab === "technology"
          ? getTechnologyVideoScore(b) - getTechnologyVideoScore(a)
        : options.tab === "weather"
          ? getWeatherVideoScore(b) - getWeatherVideoScore(a)
        : options.tab === "news"
          ? getNewsVideoScore(b) - getNewsVideoScore(a)
          : 0;

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getVideoTimestamp(b.publishedAt) - getVideoTimestamp(a.publishedAt);
  });

  if (isTrendingFeed) {
    return diversifyVideoSources(deduped, 1);
  }

  const sevenDayCutoff = new Date(getPublishedAfterIso(7)).getTime();
  const fourteenDayCutoff = new Date(getPublishedAfterIso(14)).getTime();
  const withinSevenDays = deduped.filter(
    (video) => getVideoTimestamp(video.publishedAt) >= sevenDayCutoff
  );

  if (withinSevenDays.length >= 6) {
    return diversifyVideoSources(withinSevenDays);
  }

  const withinFourteenDays = deduped.filter(
    (video) => getVideoTimestamp(video.publishedAt) >= fourteenDayCutoff
  );

  if (options.tab === "technology" || options.tab === "politics" || options.tab === "world") {
    return diversifyVideoSources(withinFourteenDays);
  }

  const finalCandidateVideos = diversifyVideoSources(withinFourteenDays);
  const finalVideos =
    finalCandidateVideos.length >= minimumTargetCount
      ? finalCandidateVideos
      : dedupeVideoItems([
          ...finalCandidateVideos,
          ...buildFallbackVideosForTab(options.tab),
        ]);

  return finalVideos;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const searchTerm = requestUrl.searchParams.get("q")?.trim() ?? "";
  const category = requestUrl.searchParams.get("category")?.trim() ?? "Trending";
  const tab = (requestUrl.searchParams.get("tab")?.trim().toLowerCase() ?? "all") as
    | WeatherCapableVideoFeedTab
    | "technology"
    | "politics"
    | "world";

  try {
    console.log("VIDEO API TAB HIT", tab);
    const useSpecializedSearchOnly = tab === "technology" || tab === "world";
    const results = await Promise.allSettled(APPROVED_CHANNELS.map((channel) => fetchVideosForChannel(channel)));

    const successfulEntries = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    const searchTerms = useSpecializedSearchOnly
      ? searchTerm
        ? [searchTerm]
        : tab === "world"
          ? [...WORLD_TAB_SEARCH_QUERIES]
          : [...TECHNOLOGY_TAB_SEARCH_QUERIES]
      : searchTerm
        ? [searchTerm]
        : [];
    const searchEntries = (
      await Promise.all(
        searchTerms.map(async (term) =>
          fetchVideosForSearchQuery(term).catch((error) => {
            console.error("YouTube Data API search failed:", error);
            return [] as RssFeedEntry[];
          })
        )
      )
    ).flat();
    const failedFeeds = results
      .map((result, index) =>
        result.status === "rejected"
          ? {
              channel: APPROVED_CHANNELS[index]?.name ?? "Unknown channel",
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            }
          : null
      )
      .filter((entry): entry is { channel: string; error: string } => entry !== null);

    if (failedFeeds.length > 0) {
      console.error("YouTube RSS feed failures:", failedFeeds);
    }

    const allEntries = [...successfulEntries, ...searchEntries];

    if (tab === "world") {
      console.log("WORLD RAW COUNT", allEntries.length);
      const rawWorldVideos = dedupeVideoItems(
        allEntries
          .map((entry) => {
            const inferredCategory = inferVideoCategory(entry.title, entry.creator, category);

            return {
              id: entry.videoId,
              youtubeId: entry.videoId,
              title: entry.title,
              creator: entry.creator,
              category: inferredCategory,
              orientation: inferVideoOrientation(entry.thumbnailWidth, entry.thumbnailHeight, {
                title: entry.title,
                thumbnailUrl: entry.thumbnailUrl,
                watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              }),
              views: 0,
              likes: 0,
              comments: 0,
              thumbnailUrl: entry.thumbnailUrl,
              publishedAt: entry.publishedAt,
              watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}?autoplay=1`,
              fallback: false,
            } satisfies VideoFeedItem;
          })
          .filter((video) => !isBlockedVideo(video))
      );

      const filteredWorldVideos = rawWorldVideos
        .filter((video) => isStrictWorldVideo(video))
        .sort((left, right) => getWorldVideoScore(right) - getWorldVideoScore(left))
        .slice(0, 10);

      console.log("WORLD FINAL COUNT", filteredWorldVideos.length);

      return Response.json({
        videos: filteredWorldVideos,
        fallback: false,
        fetchFailed: false,
        message:
          filteredWorldVideos.length === 0
            ? "No world videos available right now."
            : undefined,
      });
    }

    if (tab === "politics") {
      const rawPoliticsVideos = dedupeVideoItems(
        allEntries
          .map((entry) => {
            const inferredCategory = inferVideoCategory(entry.title, entry.creator, category);

            return {
              id: entry.videoId,
              youtubeId: entry.videoId,
              title: entry.title,
              creator: entry.creator,
              category: inferredCategory,
              orientation: inferVideoOrientation(entry.thumbnailWidth, entry.thumbnailHeight, {
                title: entry.title,
                thumbnailUrl: entry.thumbnailUrl,
                watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              }),
              views: 0,
              likes: 0,
              comments: 0,
              thumbnailUrl: entry.thumbnailUrl,
              publishedAt: entry.publishedAt,
              watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}?autoplay=1`,
              fallback: false,
            } satisfies VideoFeedItem;
          })
          .filter((video) => !isBlockedVideo(video))
      );
      const filteredPoliticsVideos = rawPoliticsVideos
        .filter((video) => isStrictPoliticsVideo(video))
        .sort((left, right) => getPoliticsVideoScore(right) - getPoliticsVideoScore(left))
        .slice(0, 10);

      return Response.json({
        videos: filteredPoliticsVideos,
        fallback: false,
        fetchFailed: false,
        message:
          filteredPoliticsVideos.length === 0
            ? "No politics videos available right now."
            : undefined,
      });
    }

    if (tab === "technology") {
      console.log("TECHNOLOGY API HIT");
      const technologyEntries = searchEntries;
      console.log("TECHNOLOGY RAW COUNT", technologyEntries.length);
      const rawTechnologyVideos = dedupeVideoItems(
        technologyEntries
          .map((entry) => {
            const inferredCategory = inferVideoCategory(entry.title, entry.creator, category);

            return {
              id: entry.videoId,
              youtubeId: entry.videoId,
              title: entry.title,
              creator: entry.creator,
              category: inferredCategory,
              orientation: inferVideoOrientation(entry.thumbnailWidth, entry.thumbnailHeight, {
                title: entry.title,
                thumbnailUrl: entry.thumbnailUrl,
                watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              }),
              views: 0,
              likes: 0,
              comments: 0,
              thumbnailUrl: entry.thumbnailUrl,
              publishedAt: entry.publishedAt,
              watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}?autoplay=1`,
              fallback: false,
            } satisfies VideoFeedItem;
          })
          .filter((video) => !isBlockedVideo(video))
      );
      console.log("TECHNOLOGY RAW TITLES", rawTechnologyVideos.map((video) => video.title));

      const filteredTechnologyVideos = rawTechnologyVideos
        .filter((video) => isStrictTechnologyVideo(video))
        .sort((left, right) => getTechnologyVideoScore(right) - getTechnologyVideoScore(left))
        .slice(0, 10);
      const rejectedTechnologyVideos = rawTechnologyVideos.filter(
        (video) => !isStrictTechnologyVideo(video)
      );

      console.log("TECHNOLOGY FILTERED COUNT", filteredTechnologyVideos.length);
      console.log("TECHNOLOGY ACCEPTED TITLES", filteredTechnologyVideos.map((video) => video.title));
      console.log("TECHNOLOGY REJECTED TITLES", rejectedTechnologyVideos.map((video) => video.title));
      console.log("TECHNOLOGY FINAL COUNT", filteredTechnologyVideos.length);
      console.log("TECHNOLOGY FINAL TITLES", filteredTechnologyVideos.map((video) => video.title));

      return Response.json({
        videos: filteredTechnologyVideos,
        fallback: false,
        fetchFailed: false,
        message:
          filteredTechnologyVideos.length === 0
            ? "No technology videos available right now."
            : undefined,
      });
    }

    if (allEntries.length === 0) {
      return Response.json({
        videos: buildFallbackVideosForTab(tab),
        fallback: true,
        message: "Falling back to placeholder videos because the YouTube RSS feeds failed.",
      });
    }

    const videos = filterAndSortVideos(allEntries, {
      category,
      searchTerm,
      tab:
        tab === "sports" ||
        tab === "news" ||
        tab === "celebrity" ||
        tab === "weather"
          ? tab
          : "all",
    });

    if (videos.length === 0) {
      return Response.json({
        videos: buildFallbackVideosForTab(tab),
        fallback: true,
        message: "No recent videos were returned by the trusted channel feeds.",
      });
    }

    return Response.json({
      videos,
      fallback: false,
      fetchFailed: false,
    });
  } catch (error) {
    console.error("Error loading RSS news videos:", error);

    if (tab === "technology" || tab === "politics" || tab === "world") {
      return Response.json({
        videos: [],
        fallback: false,
        fetchFailed: true,
        message: tab === "politics" ? "No politics videos available right now." : "Could not load videos right now.",
      });
    }

    return Response.json({
      videos: buildFallbackVideosForTab(tab),
      fallback: true,
      message: "Falling back to placeholder videos because the RSS feeds failed.",
    });
  }
}
