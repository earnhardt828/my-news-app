type ApprovedChannel = {
  channelId: string;
  name: string;
};

type YouTubeSearchItem = {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

type YouTubeVideosItem = {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

type VideoFeedItem = {
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
  category: string;
  views: number;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  watchUrl: string;
  embedUrl: string;
  fallback: boolean;
};

const APPROVED_CHANNELS: ApprovedChannel[] = [
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News" },
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN" },
  { channelId: "UCXIJgqnII2ZOINSWNOGFThA", name: "Fox News" },
  { channelId: "UCrp_UI8XtuYfpiqluWLD7Lw", name: "CNBC" },
  { channelId: "UCUMZ7gohGI9HcU9VNsr2FJQ", name: "Bloomberg" },
  { channelId: "UChqUTb7kYRX8-EiaN3XFrSQ", name: "Reuters" },
  { channelId: "UC52X5wxOL_s5yw0dQk7NtgA", name: "Associated Press" },
];

const FALLBACK_VIDEOS: VideoFeedItem[] = [
  {
    id: "fallback-1",
    youtubeId: "fallback-1",
    title: "Morning markets in 60 seconds",
    creator: "Reflekt Business",
    category: "Business",
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
    creator: "Reflekt Tech",
    category: "Tech",
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
    creator: "Reflekt World",
    category: "World",
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

async function fetchRecentVideosForChannel(
  channel: ApprovedChannel,
  apiKey: string,
  options: {
    searchTerm?: string;
    category?: string;
  }
) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  const searchQuery = [options.category, options.searchTerm]
    .filter((value) => value && value !== "Trending")
    .join(" ")
    .trim();

  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("maxResults", searchQuery ? "6" : "4");
  url.searchParams.set("order", searchQuery ? "viewCount" : "date");
  url.searchParams.set("type", "video");
  url.searchParams.set("key", apiKey);

  if (searchQuery) {
    url.searchParams.set("q", searchQuery);
  }

  const response = await fetch(url.toString(), {
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`YouTube search failed for ${channel.name}`);
  }

  const data = (await response.json()) as { items?: YouTubeSearchItem[] };
  return data.items ?? [];
}

export async function GET(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  const requestUrl = new URL(request.url);
  const searchTerm = requestUrl.searchParams.get("q")?.trim() ?? "";
  const category = requestUrl.searchParams.get("category")?.trim() ?? "Trending";

  if (!apiKey) {
    return Response.json({
      videos: FALLBACK_VIDEOS,
      fallback: true,
      message: "Set NEXT_PUBLIC_YOUTUBE_API_KEY to load real news videos.",
    });
  }

  try {
    const searchResults = await Promise.all(
      APPROVED_CHANNELS.map((channel) =>
        fetchRecentVideosForChannel(channel, apiKey, {
          searchTerm,
          category,
        })
      )
    );

    const flattenedSearchResults = searchResults.flat();
    const videoIds = flattenedSearchResults
      .map((item) => item.id?.videoId)
      .filter((videoId): videoId is string => Boolean(videoId));

    if (videoIds.length === 0) {
      return Response.json({
        videos: FALLBACK_VIDEOS,
        fallback: true,
        message: "No recent videos were returned by YouTube.",
      });
    }

    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics");
    statsUrl.searchParams.set("id", videoIds.join(","));
    statsUrl.searchParams.set("key", apiKey);

    const statsResponse = await fetch(statsUrl.toString(), {
      next: { revalidate: 900 },
    });

    if (!statsResponse.ok) {
      throw new Error("YouTube video statistics request failed.");
    }

    const statsData = (await statsResponse.json()) as {
      items?: YouTubeVideosItem[];
    };
    const statsLookup = new Map(
      (statsData.items ?? []).map((item) => [
        item.id,
        {
          views: Number(item.statistics?.viewCount ?? "0"),
          likes: Number(item.statistics?.likeCount ?? "0"),
          comments: Number(item.statistics?.commentCount ?? "0"),
        },
      ])
    );

    const videos = flattenedSearchResults
      .map((item): VideoFeedItem | null => {
        const youtubeId = item.id?.videoId;

        if (!youtubeId) {
          return null;
        }

        const stats = statsLookup.get(youtubeId);
        const thumbnailUrl =
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null;

        return {
          id: youtubeId,
          youtubeId,
          title: item.snippet?.title ?? "Untitled video",
          creator: item.snippet?.channelTitle ?? "Trusted News Source",
          category: inferVideoCategory(
            item.snippet?.title ?? "",
            item.snippet?.channelTitle ?? "",
            category
          ),
          views: stats?.views ?? 0,
          likes: stats?.likes ?? 0,
          comments: stats?.comments ?? 0,
          thumbnailUrl,
          publishedAt: item.snippet?.publishedAt ?? null,
          watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`,
          fallback: false,
        };
      })
      .filter((video): video is VideoFeedItem => video !== null)
      .sort((a, b) => {
        const popularityDifference =
          b.views - a.views || b.likes - a.likes || b.comments - a.comments;

        if (popularityDifference !== 0) {
          return popularityDifference;
        }

        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

    if (videos.length === 0) {
      return Response.json({
        videos: FALLBACK_VIDEOS,
        fallback: true,
        message: "No usable YouTube videos were returned.",
      });
    }

    return Response.json({ videos, fallback: false });
  } catch (error) {
    console.error("Error loading YouTube news videos:", error);

    return Response.json({
      videos: FALLBACK_VIDEOS,
      fallback: true,
      message: "Falling back to placeholder videos because the YouTube API failed.",
    });
  }
}
