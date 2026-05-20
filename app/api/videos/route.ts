type ApprovedChannel = {
  channelId: string;
  name: string;
};

type RssFeedEntry = {
  videoId: string;
  title: string;
  creator: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
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

type VideoFeedTab = "all" | "news" | "sports";

const APPROVED_CHANNELS: ApprovedChannel[] = [
  { channelId: "UCiWLfSweyRNmLpgEHekhoAg", name: "ESPN" },
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News" },
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN" },
  { channelId: "UCXIJgqnII2ZOINSWNOGFThA", name: "Fox News" },
  { channelId: "UCrp_UI8XtuYfpiqluWLD7Lw", name: "CNBC" },
  { channelId: "UCUMZ7gohGI9HcU9VNsr2FJQ", name: "Bloomberg" },
  { channelId: "UChqUTb7kYRX8-EiaN3XFrSQ", name: "Reuters" },
  { channelId: "UC52X5wxOL_s5yw0dQk7NtgA", name: "Associated Press" },
  { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", name: "ABC News" },
  { channelId: "UCoMdktPbSTixAyNGwb-UYkQ", name: "Sky News" },
  { channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", name: "Al Jazeera English" },
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

function getSportsVideoScore(video: Pick<VideoFeedItem, "title" | "creator" | "category" | "orientation">) {
  const haystack = getVideoSearchHaystack(video);
  let score = 0;

  if (
    /(highlights?|top plays|touchdown|dunk|home run|goals?|save|replay|buzzer beater)/.test(
      haystack
    )
  ) {
    score += 180;
  }

  if (
    /(sportscenter top plays|espn highlights|nba highlights|nfl highlights|mlb highlights|nhl highlights|soccer goals highlights|cbs sports highlights|bleacher report highlights|fox sports highlights|pga tour highlights|nascar highlights)/.test(
      haystack
    )
  ) {
    score += 150;
  }

  if (
    /(espn|sportscenter|nba|nfl|mlb|nhl|soccer|goal|golf|nascar|formula 1|bleacher report|cbs sports|fox sports|nbc sports|sports illustrated)/.test(
      haystack
    )
  ) {
    score += 95;
  }

  if (video.category === "Sports") {
    score += 80;
  }

  if (video.orientation === "vertical") {
    score += 24;
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

  if (/(bbc news|cnn|fox news|reuters|associated press|ap news|abc news|sky news|al jazeera|bloomberg|cnbc)/.test(haystack)) {
    score += 56;
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

function getPublishedAfterIso(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function normalizeForSearch(value: string) {
  return value.trim().toLowerCase();
}

function buildRssFeedUrl(channelId: string) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
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
    tab: VideoFeedTab;
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

  const searchFiltered = normalizedSearch
    ? mappedVideos.filter((video) => {
        const haystack = normalizeForSearch(
          `${video.title} ${video.creator} ${video.category}`
        );
        return haystack.includes(normalizedSearch);
      })
    : mappedVideos;

  const categoryFiltered =
    options.category !== "Trending"
      ? searchFiltered.filter((video) => video.category === options.category)
      : searchFiltered;

  const tabFiltered =
    options.tab === "sports"
      ? categoryFiltered.filter((video) => getSportsVideoScore(video) > 0)
      : options.tab === "news"
        ? categoryFiltered.filter(
            (video) =>
              getSportsVideoScore(video) < 120 &&
              (getNewsVideoScore(video) > 0 || video.category !== "Sports")
          )
        : categoryFiltered;

  const deduped = Array.from(
    new Map(tabFiltered.map((video) => [video.youtubeId, video])).values()
  );

  deduped.sort((a, b) => {
    const scoreDelta =
      options.tab === "sports"
        ? getSportsVideoScore(b) - getSportsVideoScore(a)
        : options.tab === "news"
          ? getNewsVideoScore(b) - getNewsVideoScore(a)
          : 0;

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getVideoTimestamp(b.publishedAt) - getVideoTimestamp(a.publishedAt);
  });

  if (isTrendingFeed) {
    return deduped;
  }

  const sevenDayCutoff = new Date(getPublishedAfterIso(7)).getTime();
  const fourteenDayCutoff = new Date(getPublishedAfterIso(14)).getTime();
  const withinSevenDays = deduped.filter(
    (video) => getVideoTimestamp(video.publishedAt) >= sevenDayCutoff
  );

  if (withinSevenDays.length >= 6) {
    return withinSevenDays;
  }

  const withinFourteenDays = deduped.filter(
    (video) => getVideoTimestamp(video.publishedAt) >= fourteenDayCutoff
  );

  return withinFourteenDays;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const searchTerm = requestUrl.searchParams.get("q")?.trim() ?? "";
  const category = requestUrl.searchParams.get("category")?.trim() ?? "Trending";
  const tab = (requestUrl.searchParams.get("tab")?.trim().toLowerCase() ?? "all") as VideoFeedTab;

  try {
    const results = await Promise.allSettled(
      APPROVED_CHANNELS.map((channel) => fetchVideosForChannel(channel))
    );

    const successfulEntries = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
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

    if (successfulEntries.length === 0) {
      return Response.json({
        videos: FALLBACK_VIDEOS,
        fallback: true,
        message: "Falling back to placeholder videos because the YouTube RSS feeds failed.",
      });
    }

    const videos = filterAndSortVideos(successfulEntries, {
      category,
      searchTerm,
      tab: tab === "sports" || tab === "news" ? tab : "all",
    });

    if (videos.length === 0) {
      return Response.json({
        videos: FALLBACK_VIDEOS,
        fallback: true,
        message: "No recent videos were returned by the trusted channel feeds.",
      });
    }

    return Response.json({
      videos,
      fallback: false,
    });
  } catch (error) {
    console.error("Error loading RSS news videos:", error);

    return Response.json({
      videos: FALLBACK_VIDEOS,
      fallback: true,
      message: "Falling back to placeholder videos because the RSS feeds failed.",
    });
  }
}
