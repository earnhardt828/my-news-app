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
    likeCount?: string;
    commentCount?: string;
  };
};

type VideoFeedItem = {
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
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
    creator: "Mirur Business",
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
    creator: "Mirur Tech",
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
    creator: "Mirur World",
    likes: 172,
    comments: 19,
    thumbnailUrl: null,
    publishedAt: null,
    watchUrl: "",
    embedUrl: "",
    fallback: true,
  },
];

async function fetchRecentVideosForChannel(
  channel: ApprovedChannel,
  apiKey: string
) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("order", "date");
  url.searchParams.set("type", "video");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`YouTube search failed for ${channel.name}`);
  }

  const data = (await response.json()) as { items?: YouTubeSearchItem[] };
  return data.items ?? [];
}

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  if (!apiKey) {
    return Response.json({
      videos: FALLBACK_VIDEOS,
      fallback: true,
      message: "Set NEXT_PUBLIC_YOUTUBE_API_KEY to load real news videos.",
    });
  }

  try {
    const searchResults = await Promise.all(
      APPROVED_CHANNELS.map((channel) => fetchRecentVideosForChannel(channel, apiKey))
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
