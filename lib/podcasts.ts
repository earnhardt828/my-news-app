import { PODCAST_FEEDS, type PodcastFeedCategory, type PodcastFeedConfig } from "./podcast-feeds";

export type PodcastEpisode = {
  slug: string;
  title: string;
  publishedAt: string | null;
  description: string | null;
  audioUrl: string | null;
  duration: string | null;
};

export type PodcastShow = {
  slug: string;
  title: string;
  publisher: string;
  category: PodcastFeedCategory;
  coverArt: string | null;
  featured: boolean;
  feedUrl: string;
  latestEpisode: PodcastEpisode | null;
  episodes: PodcastEpisode[];
};

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

function extractImageHref(block: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}[^>]*href="([^"]+)"[^>]*/?>`, "i");
  return block.match(pattern)?.[1] ?? null;
}

function extractEnclosureUrl(block: string) {
  const match = block.match(/<enclosure\b([^>]*)\/?>/i);

  if (!match) {
    return null;
  }

  const attrs = match[1];
  const type = attrs.match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase() ?? "";
  const url = attrs.match(/\burl="([^"]+)"/i)?.[1] ?? null;

  if (!url) {
    return null;
  }

  if (type && !type.startsWith("audio/")) {
    return null;
  }

  return url;
}

function normalizeDate(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function slugifyValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(value: string | null) {
  if (!value) {
    return null;
  }

  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchPodcastShow(config: PodcastFeedConfig): Promise<PodcastShow> {
  const response = await fetch(config.feedUrl, {
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`Podcast feed request failed for ${config.title} (${response.status})`);
  }

  const xml = await response.text();
  const channelBlock = xml.match(/<channel\b[\s\S]*<\/channel>/i)?.[0] ?? xml;
  const showTitle = extractXmlTag(channelBlock, "title") ?? config.title;
  const publisher =
    extractXmlTag(channelBlock, "itunes:author") ??
    extractXmlTag(channelBlock, "managingEditor") ??
    extractXmlTag(channelBlock, "author") ??
    config.publisher;
  const coverArt =
    extractImageHref(channelBlock, "itunes:image") ??
    extractXmlTag(channelBlock, "url") ??
    xml.match(/<image>[\s\S]*?<url>([^<]+)<\/url>[\s\S]*?<\/image>/i)?.[1] ??
    null;
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  const episodes = itemBlocks
    .map((item): PodcastEpisode | null => {
      const title = extractXmlTag(item, "title");
      const audioUrl = extractEnclosureUrl(item);

      if (!title || !audioUrl) {
        return null;
      }

      const guid = extractXmlTag(item, "guid");
      const episodeSlug = slugifyValue(guid ?? title);

      return {
        slug: episodeSlug,
        title,
        publishedAt: normalizeDate(extractXmlTag(item, "pubDate")),
        description:
          stripHtml(extractXmlTag(item, "content:encoded")) ??
          stripHtml(extractXmlTag(item, "description")),
        audioUrl,
        duration: extractXmlTag(item, "itunes:duration"),
      };
    })
    .filter((episode): episode is PodcastEpisode => episode !== null)
    .sort((left, right) => {
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return {
    slug: config.slug,
    title: showTitle,
    publisher,
    category: config.category,
    coverArt,
    featured: Boolean(config.featured),
    feedUrl: config.feedUrl,
    latestEpisode: episodes[0] ?? null,
    episodes,
  };
}

export async function fetchPodcastDirectory() {
  const results = await Promise.allSettled(PODCAST_FEEDS.map((feed) => fetchPodcastShow(feed)));

  const shows = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const errors = results
    .map((result, index) =>
      result.status === "rejected"
        ? {
            feed: PODCAST_FEEDS[index]?.title ?? "Unknown podcast",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          }
        : null
    )
    .filter((entry): entry is { feed: string; error: string } => entry !== null);

  if (errors.length > 0) {
    console.error("PODCAST RSS FAILURES", errors);
  }

  const featured = shows.filter((show) => show.featured).slice(0, 8);

  return {
    shows,
    sections: {
      featured,
      news: shows.filter((show) => show.category === "News"),
      sports: shows.filter((show) => show.category === "Sports"),
      business: shows.filter((show) => show.category === "Business"),
      technology: shows.filter((show) => show.category === "Technology"),
    },
  };
}

export async function fetchPodcastEpisodeBySlug(podcastSlug: string, episodeSlug: string) {
  const { shows } = await fetchPodcastDirectory();
  const show = shows.find((entry) => entry.slug === podcastSlug) ?? null;

  if (!show) {
    return null;
  }

  const episode = show.episodes.find((entry) => entry.slug === episodeSlug) ?? null;

  if (!episode) {
    return null;
  }

  return {
    show,
    episode,
  };
}
