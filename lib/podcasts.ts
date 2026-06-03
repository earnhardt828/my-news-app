import { createHash } from "node:crypto";
import {
  PODCAST_CATEGORY_SEARCH_TERMS,
  PODCAST_FEEDS,
  type PodcastFeedCategory,
  type PodcastFeedConfig,
} from "./podcast-feeds";

export type PodcastProvider =
  | "curated"
  | "itunes"
  | "apple"
  | "podcast-index"
  | "listen-notes";

export type PodcastEpisode = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  description: string | null;
  audioUrl: string | null;
  duration: string | null;
  episodeUrl: string | null;
};

export type PodcastShow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  summary?: string | null;
  publisher: string;
  artistName?: string | null;
  image: string | null;
  artworkUrl600?: string | null;
  artworkUrl100?: string | null;
  artwork?: string | null;
  podcastImage?: string | null;
  feedImage?: string | null;
  itunesImage?: string | null;
  coverArt: string | null;
  category: PodcastFeedCategory;
  feedUrl: string;
  episodeCount: number;
  provider: PodcastProvider;
  sourceProvider: PodcastProvider;
  featured: boolean;
  latestEpisode: PodcastEpisode | null;
  episodes: PodcastEpisode[];
  lastPublishedAt: string | null;
};

export type PodcastDirectory = {
  shows: PodcastShow[];
  sections: Record<
    | "featured"
    | "science"
    | "trueCrime"
    | "arts"
    | "business"
    | "sports"
    | "politics",
    PodcastShow[]
  >;
};

type DiscoveryCandidate = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  summary?: string | null;
  publisher: string;
  artistName?: string | null;
  image: string | null;
  artworkUrl600?: string | null;
  artworkUrl100?: string | null;
  artwork?: string | null;
  podcastImage?: string | null;
  feedImage?: string | null;
  itunesImage?: string | null;
  category: PodcastFeedCategory;
  feedUrl: string;
  episodeCount: number;
  sourceProvider: PodcastProvider;
  featured: boolean;
  score: number;
  lastPublishedAt: string | null;
  searchTerms: string[];
};

export const PODCAST_INDEX_BACKGROUND_ONLY = true;

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

function buildPodcastId(parts: Array<string | null | undefined>) {
  return createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function normalizePodcastText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function looksLikeUsablePodcastImage(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function scoreDiscoveryCandidate(candidate: DiscoveryCandidate) {
  let score = 0;

  if (candidate.featured) {
    score += 300;
  }

  if (candidate.image) {
    score += 120;
  }

  if (candidate.episodeCount > 0) {
    score += Math.min(candidate.episodeCount, 200);
  }

  if (candidate.lastPublishedAt) {
    score += Math.max(
      0,
      100 - Math.floor((Date.now() - new Date(candidate.lastPublishedAt).getTime()) / 86_400_000)
    );
  }

  if (candidate.sourceProvider === "curated") {
    score += 80;
  }

  return score;
}

function createCandidateFromFeed(config: PodcastFeedConfig): DiscoveryCandidate {
  const title = config.title.trim();
  const publisher = config.publisher.trim();

  return {
    id: buildPodcastId(["curated", config.feedUrl, title]),
    slug: config.slug,
    title,
    description: null,
    publisher,
    image: null,
    category: config.category,
    feedUrl: config.feedUrl,
    episodeCount: 0,
    sourceProvider: "curated",
    featured: Boolean(config.featured),
    score: 0,
    lastPublishedAt: null,
    searchTerms: config.searchTerms ?? [title, publisher, config.category],
  };
}

function matchesPodcastSearch(candidate: DiscoveryCandidate, query: string) {
  const normalizedQuery = normalizePodcastText(query);

  if (!normalizedQuery) {
    return true;
  }

  return [candidate.title, candidate.publisher, candidate.category, candidate.description]
    .filter(Boolean)
    .some((value) => normalizePodcastText(value).includes(normalizedQuery));
}

function createFallbackShowFromCandidate(candidate: DiscoveryCandidate): PodcastShow {
  return {
    id: candidate.id,
    slug: candidate.slug || slugifyValue(candidate.title),
    title: candidate.title,
    description: candidate.description,
    summary: candidate.summary ?? candidate.description,
    publisher: candidate.publisher,
    artistName: candidate.artistName ?? candidate.publisher,
    image: looksLikeUsablePodcastImage(candidate.image) ? candidate.image : null,
    artworkUrl600: looksLikeUsablePodcastImage(candidate.artworkUrl600) ? candidate.artworkUrl600 : null,
    artworkUrl100: looksLikeUsablePodcastImage(candidate.artworkUrl100) ? candidate.artworkUrl100 : null,
    artwork: looksLikeUsablePodcastImage(candidate.artwork) ? candidate.artwork : null,
    podcastImage: looksLikeUsablePodcastImage(candidate.podcastImage) ? candidate.podcastImage : null,
    feedImage: looksLikeUsablePodcastImage(candidate.feedImage) ? candidate.feedImage : null,
    itunesImage: looksLikeUsablePodcastImage(candidate.itunesImage) ? candidate.itunesImage : null,
    coverArt: looksLikeUsablePodcastImage(candidate.image) ? candidate.image : null,
    category: candidate.category,
    feedUrl: candidate.feedUrl,
    episodeCount: candidate.episodeCount,
    provider: candidate.sourceProvider,
    sourceProvider: candidate.sourceProvider,
    featured: candidate.featured,
    latestEpisode: null,
    episodes: [],
    lastPublishedAt: candidate.lastPublishedAt,
  };
}

async function fetchPodcastShow(candidate: DiscoveryCandidate): Promise<PodcastShow> {
  const response = await fetch(candidate.feedUrl, {
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`Podcast feed request failed for ${candidate.title} (${response.status})`);
  }

  const xml = await response.text();
  const channelBlock = xml.match(/<channel\b[\s\S]*<\/channel>/i)?.[0] ?? xml;
  const showTitle = extractXmlTag(channelBlock, "title") ?? candidate.title;
  const publisher =
    extractXmlTag(channelBlock, "itunes:author") ??
    extractXmlTag(channelBlock, "managingEditor") ??
    extractXmlTag(channelBlock, "author") ??
    candidate.publisher;
  const description =
    stripHtml(extractXmlTag(channelBlock, "itunes:summary")) ??
    stripHtml(extractXmlTag(channelBlock, "description")) ??
    candidate.description;
  const coverArt =
    extractImageHref(channelBlock, "itunes:image") ??
    xml.match(/<image>[\s\S]*?<url>([^<]+)<\/url>[\s\S]*?<\/image>/i)?.[1] ??
    candidate.image ??
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
      const publishedAt = normalizeDate(extractXmlTag(item, "pubDate"));

      return {
        id: buildPodcastId([candidate.feedUrl, guid ?? title, publishedAt]),
        slug: episodeSlug,
        title,
        publishedAt,
        description:
          stripHtml(extractXmlTag(item, "content:encoded")) ??
          stripHtml(extractXmlTag(item, "description")),
        audioUrl,
        duration: extractXmlTag(item, "itunes:duration"),
        episodeUrl: extractXmlTag(item, "link"),
      };
    })
    .filter((episode): episode is PodcastEpisode => episode !== null)
    .sort((left, right) => {
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return {
    id: candidate.id,
    slug: candidate.slug || slugifyValue(showTitle),
    title: showTitle,
    description,
    summary: description,
    publisher,
    artistName: publisher,
    image: looksLikeUsablePodcastImage(coverArt) ? coverArt : null,
    artworkUrl600: null,
    artworkUrl100: null,
    artwork: looksLikeUsablePodcastImage(candidate.image) ? candidate.image : null,
    podcastImage: looksLikeUsablePodcastImage(candidate.image) ? candidate.image : null,
    feedImage: looksLikeUsablePodcastImage(coverArt) ? coverArt : null,
    itunesImage: looksLikeUsablePodcastImage(candidate.image) ? candidate.image : null,
    coverArt: looksLikeUsablePodcastImage(coverArt) ? coverArt : null,
    category: candidate.category,
    feedUrl: candidate.feedUrl,
    episodeCount: episodes.length || candidate.episodeCount,
    provider: candidate.sourceProvider,
    sourceProvider: candidate.sourceProvider,
    featured: candidate.featured,
    latestEpisode: episodes[0] ?? null,
    episodes,
    lastPublishedAt: episodes[0]?.publishedAt ?? candidate.lastPublishedAt,
  };
}

async function fetchItunesPodcasts(
  term: string,
  category: PodcastFeedCategory,
  provider: "itunes" | "apple"
): Promise<DiscoveryCandidate[]> {
  const requestUrl = new URL("https://itunes.apple.com/search");
  requestUrl.searchParams.set("media", "podcast");
  requestUrl.searchParams.set("entity", "podcast");
  requestUrl.searchParams.set("limit", "8");
  requestUrl.searchParams.set("term", term);

  const response = await fetch(requestUrl.toString(), {
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`${provider} search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      collectionId?: number;
      collectionName?: string;
      artistName?: string;
      artworkUrl600?: string;
      artworkUrl100?: string;
      feedUrl?: string;
      primaryGenreName?: string;
      trackCount?: number;
      releaseDate?: string;
    }>;
  };

  return (payload.results ?? [])
    .map((result) => {
      const title = result.collectionName?.trim();
      const feedUrl = result.feedUrl?.trim();
      const image = result.artworkUrl600?.trim() || result.artworkUrl100?.trim() || null;

      if (!title || !feedUrl || !looksLikeUsablePodcastImage(image)) {
        return null;
      }

      const publisher = result.artistName?.trim() || "Podcast";
      const slug = slugifyValue(`${title}-${publisher}`);
      const candidate: DiscoveryCandidate = {
        id: buildPodcastId([provider, String(result.collectionId ?? feedUrl), title]),
        slug,
        title,
        description: result.primaryGenreName?.trim() || null,
        summary: result.primaryGenreName?.trim() || null,
        publisher,
        artistName: publisher,
        image,
        artworkUrl600: result.artworkUrl600?.trim() || null,
        artworkUrl100: result.artworkUrl100?.trim() || null,
        artwork: image,
        podcastImage: image,
        feedImage: null,
        itunesImage: image,
        category,
        feedUrl,
        episodeCount: Number(result.trackCount ?? 0),
        sourceProvider: provider,
        featured: false,
        score: 0,
        lastPublishedAt: normalizeDate(result.releaseDate ?? null),
        searchTerms: [term, title, publisher, category],
      };
      candidate.score = scoreDiscoveryCandidate(candidate);
      return candidate;
    })
    .filter((candidate): candidate is DiscoveryCandidate => candidate !== null);
}

async function fetchPodcastIndexPodcasts(
  term: string,
  category: PodcastFeedCategory
): Promise<DiscoveryCandidate[]> {
  const apiKey = process.env.PODCASTINDEX_API_KEY?.trim();
  const apiSecret = process.env.PODCASTINDEX_API_SECRET?.trim();

  console.log("PODCASTINDEX API KEY PRESENT", Boolean(apiKey));
  console.log("PODCASTINDEX API SECRET PRESENT", Boolean(apiSecret));

  if (!apiKey || !apiSecret) {
    return [];
  }

  const authDate = Math.floor(Date.now() / 1000).toString();
  const authorization = createHash("sha1")
    .update(apiKey + apiSecret + authDate)
    .digest("hex");
  const requestUrl = new URL("https://api.podcastindex.org/api/1.0/search/byterm");
  requestUrl.searchParams.set("q", term);
  requestUrl.searchParams.set("max", "8");
  console.log("PODCASTINDEX REQUEST URL", requestUrl.toString());

  const response = await fetch(requestUrl.toString(), {
    headers: {
      "X-Auth-Date": authDate,
      "X-Auth-Key": apiKey,
      Authorization: authorization,
      "User-Agent": "Graffiti/1.0",
    },
    next: { revalidate: 1800 },
  });

  console.log("PODCASTINDEX RESPONSE STATUS", response.status);

  if (!response.ok) {
    throw new Error(`podcast-index search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    feeds?: Array<{
      id?: number;
      title?: string;
      description?: string;
      author?: string;
      image?: string;
      url?: string;
      episodeCount?: number;
      lastUpdateTime?: number;
    }>;
  };

  console.log("PODCASTINDEX RAW COUNT", (payload.feeds ?? []).length);
  const normalized = (payload.feeds ?? [])
    .map((feed) => {
      const title = feed.title?.trim();
      const feedUrl = feed.url?.trim();
      const image = feed.image?.trim() ?? null;

      if (!title || !feedUrl || !looksLikeUsablePodcastImage(image)) {
        return null;
      }

      const publisher = feed.author?.trim() || "Podcast";
      const candidate: DiscoveryCandidate = {
        id: buildPodcastId(["podcast-index", String(feed.id ?? feedUrl), title]),
        slug: slugifyValue(`${title}-${publisher}`),
        title,
        description: stripHtml(feed.description ?? null),
        summary: stripHtml(feed.description ?? null),
        publisher,
        artistName: publisher,
        image,
        artworkUrl600: image,
        artworkUrl100: image,
        artwork: image,
        podcastImage: image,
        feedImage: null,
        itunesImage: null,
        category,
        feedUrl,
        episodeCount: Number(feed.episodeCount ?? 0),
        sourceProvider: "podcast-index",
        featured: false,
        score: 0,
        lastPublishedAt:
          typeof feed.lastUpdateTime === "number" && Number.isFinite(feed.lastUpdateTime)
            ? new Date(feed.lastUpdateTime * 1000).toISOString()
            : null,
        searchTerms: [term, title, publisher, category],
      };
      candidate.score = scoreDiscoveryCandidate(candidate);
      return candidate;
    })
    .filter((candidate): candidate is DiscoveryCandidate => candidate !== null);

  console.log("PODCASTINDEX NORMALIZED COUNT", normalized.length);

  return normalized;
}

async function fetchListenNotesPodcasts(
  term: string,
  category: PodcastFeedCategory
): Promise<DiscoveryCandidate[]> {
  const apiKey = process.env.LISTEN_NOTES_API_KEY?.trim();

  if (!apiKey) {
    return [];
  }

  const requestUrl = new URL("https://listen-api.listennotes.com/api/v2/search");
  requestUrl.searchParams.set("q", term);
  requestUrl.searchParams.set("type", "podcast");
  requestUrl.searchParams.set("offset", "0");
  requestUrl.searchParams.set("len_min", "5");
  requestUrl.searchParams.set("sort_by_date", "0");

  const response = await fetch(requestUrl.toString(), {
    headers: {
      "X-ListenAPI-Key": apiKey,
    },
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`listen-notes search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      id?: string;
      title_original?: string;
      description_original?: string;
      publisher_original?: string;
      image?: string;
      rss?: string;
      total_episodes?: number;
      latest_pub_date_ms?: number;
    }>;
  };

  return (payload.results ?? [])
    .map((result) => {
      const title = result.title_original?.trim();
      const feedUrl = result.rss?.trim();
      const image = result.image?.trim() ?? null;

      if (!title || !feedUrl || !looksLikeUsablePodcastImage(image)) {
        return null;
      }

      const publisher = result.publisher_original?.trim() || "Podcast";
      const candidate: DiscoveryCandidate = {
        id: buildPodcastId(["listen-notes", result.id ?? feedUrl, title]),
        slug: slugifyValue(`${title}-${publisher}`),
        title,
        description: stripHtml(result.description_original ?? null),
        summary: stripHtml(result.description_original ?? null),
        publisher,
        artistName: publisher,
        image,
        artworkUrl600: image,
        artworkUrl100: image,
        artwork: image,
        podcastImage: image,
        feedImage: null,
        itunesImage: null,
        category,
        feedUrl,
        episodeCount: Number(result.total_episodes ?? 0),
        sourceProvider: "listen-notes",
        featured: false,
        score: 0,
        lastPublishedAt:
          typeof result.latest_pub_date_ms === "number" && Number.isFinite(result.latest_pub_date_ms)
            ? new Date(result.latest_pub_date_ms).toISOString()
            : null,
        searchTerms: [term, title, publisher, category],
      };
      candidate.score = scoreDiscoveryCandidate(candidate);
      return candidate;
    })
    .filter((candidate): candidate is DiscoveryCandidate => candidate !== null);
}

function dedupeDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const dedupedByKey = new Map<string, DiscoveryCandidate>();
  const aliasToPrimaryKey = new Map<string, string>();

  candidates
    .slice()
    .sort((left, right) => right.score - left.score)
    .forEach((candidate) => {
      const keys = [
        normalizePodcastText(candidate.feedUrl),
        `${normalizePodcastText(candidate.publisher)}::${normalizePodcastText(candidate.title)}`,
        normalizePodcastText(candidate.title),
      ].filter(Boolean);

      const existingPrimaryKey = keys
        .map((key) => aliasToPrimaryKey.get(key))
        .find((value): value is string => Boolean(value));

      if (!existingPrimaryKey) {
        const primaryKey = keys[0] ?? candidate.id;
        dedupedByKey.set(primaryKey, candidate);
        keys.forEach((key) => aliasToPrimaryKey.set(key, primaryKey));
        return;
      }

      const existing = dedupedByKey.get(existingPrimaryKey);
      if (!existing) {
        dedupedByKey.set(existingPrimaryKey, candidate);
        keys.forEach((key) => aliasToPrimaryKey.set(key, existingPrimaryKey));
        return;
      }

      const merged: DiscoveryCandidate = {
        ...existing,
        ...candidate,
        summary: existing.summary || candidate.summary || existing.description || candidate.description,
        artistName: existing.artistName || candidate.artistName || existing.publisher || candidate.publisher,
        image: existing.image || candidate.image,
        artworkUrl600: existing.artworkUrl600 || candidate.artworkUrl600 || existing.image || candidate.image,
        artworkUrl100: existing.artworkUrl100 || candidate.artworkUrl100 || candidate.image,
        artwork: existing.artwork || candidate.artwork || existing.image || candidate.image,
        podcastImage: existing.podcastImage || candidate.podcastImage || existing.image || candidate.image,
        feedImage: existing.feedImage || candidate.feedImage || null,
        itunesImage: existing.itunesImage || candidate.itunesImage || candidate.image || null,
        feedUrl: existing.feedUrl || candidate.feedUrl,
        searchTerms: Array.from(new Set([...(existing.searchTerms ?? []), ...(candidate.searchTerms ?? [])])),
        score: Math.max(existing.score, candidate.score),
        featured: existing.featured || candidate.featured,
      };

      if (!existing.image && merged.image) {
        console.log("PODCAST ARTWORK_ENRICHED", {
          title: merged.title,
          provider: candidate.sourceProvider,
          image: merged.image,
        });
      }

      dedupedByKey.set(existingPrimaryKey, merged);
      keys.forEach((key) => aliasToPrimaryKey.set(key, existingPrimaryKey));
    });

  return Array.from(dedupedByKey.values());
}

export function buildStaticFallbackPodcastDirectory(searchQuery?: string): PodcastDirectory {
  const fallbackShows = PODCAST_FEEDS.map((feed) =>
    createFallbackShowFromCandidate({
      ...createCandidateFromFeed(feed),
      score: scoreDiscoveryCandidate(createCandidateFromFeed(feed)),
    })
  ).filter((show) =>
    !searchQuery
      ? true
      : [show.title, show.publisher, show.category, show.description]
          .filter(Boolean)
          .some((value) => normalizePodcastText(value).includes(normalizePodcastText(searchQuery)))
  );

  console.log("PODCAST FALLBACK BASE COUNT", fallbackShows.length);

  return {
    shows: fallbackShows,
    sections: buildPodcastSections(fallbackShows),
  };
}

async function fetchDiscoveryCandidates(searchQuery?: string) {
  const baseCandidates = PODCAST_FEEDS.map(createCandidateFromFeed);
  const queriesByCategory = Object.entries(PODCAST_CATEGORY_SEARCH_TERMS) as Array<
    [PodcastFeedCategory, string[]]
  >;

  const discoveryPromises = queriesByCategory.flatMap(([category, terms]) => {
    const activeTerms = searchQuery ? [searchQuery] : terms.slice(0, 4);

    return activeTerms.flatMap((term) => [
      fetchItunesPodcasts(term, category, "itunes"),
      fetchItunesPodcasts(term, category, "apple"),
      ...(!PODCAST_INDEX_BACKGROUND_ONLY || Boolean(searchQuery)
        ? [fetchPodcastIndexPodcasts(term, category)]
        : []),
      fetchListenNotesPodcasts(term, category),
    ]);
  });

  const settledResults = await Promise.allSettled(discoveryPromises);
  const discoveredCandidates = settledResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  console.log(
    "ITUNES PODCAST RESULT COUNT",
    discoveredCandidates.filter(
      (candidate) => candidate.sourceProvider === "itunes" || candidate.sourceProvider === "apple"
    ).length
  );
  console.log(
    "PODCASTINDEX RESULT COUNT",
    discoveredCandidates.filter((candidate) => candidate.sourceProvider === "podcast-index").length
  );

  const providerCounts = discoveredCandidates.reduce<Record<string, number>>((accumulator, candidate) => {
    accumulator[candidate.sourceProvider] = (accumulator[candidate.sourceProvider] ?? 0) + 1;
    return accumulator;
  }, { curated: baseCandidates.length });

  console.log("PODCAST_PROVIDER_COUNT", providerCounts);

  const mergedCandidates = dedupeDiscoveryCandidates(
    [...baseCandidates, ...discoveredCandidates]
      .filter((candidate) => !searchQuery || matchesPodcastSearch(candidate, searchQuery))
      .map((candidate) => {
        const nextCandidate = { ...candidate };
        nextCandidate.score = scoreDiscoveryCandidate(nextCandidate);
        return nextCandidate;
      })
  );

  console.log("PODCAST_MERGED_COUNT", mergedCandidates.length);

  return mergedCandidates;
}

function rankShowsForCategory(shows: PodcastShow[]) {
  return shows
    .slice()
    .sort((left, right) => {
      const rightDate = right.lastPublishedAt ? new Date(right.lastPublishedAt).getTime() : 0;
      const leftDate = left.lastPublishedAt ? new Date(left.lastPublishedAt).getTime() : 0;

      if (Number(right.featured) !== Number(left.featured)) {
        return Number(right.featured) - Number(left.featured);
      }

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      if (right.episodeCount !== left.episodeCount) {
        return right.episodeCount - left.episodeCount;
      }

      return left.title.localeCompare(right.title);
    });
}

function buildPodcastSections(shows: PodcastShow[]): PodcastDirectory["sections"] {
  const science = rankShowsForCategory(shows.filter((show) => show.category === "Science"));
  const trueCrime = rankShowsForCategory(shows.filter((show) => show.category === "True Crime"));
  const arts = rankShowsForCategory(shows.filter((show) => show.category === "Arts"));
  const business = rankShowsForCategory(shows.filter((show) => show.category === "Business"));
  const sports = rankShowsForCategory(shows.filter((show) => show.category === "Sports"));
  const politics = rankShowsForCategory(shows.filter((show) => show.category === "Politics"));
  const featured = rankShowsForCategory(shows.filter((show) => show.featured)).slice(0, 12);

  const categoryCounts = {
    featured: featured.length,
    science: science.length,
    trueCrime: trueCrime.length,
    arts: arts.length,
    business: business.length,
    sports: sports.length,
    politics: politics.length,
  };

  console.log("PODCAST_CATEGORY_COUNT", categoryCounts);

  return {
    featured,
    science,
    trueCrime,
    arts,
    business,
    sports,
    politics,
  };
}

export async function fetchPodcastDirectory(searchQuery?: string): Promise<PodcastDirectory> {
  const mergedCandidates = await fetchDiscoveryCandidates(searchQuery);
  const hydratedShows = await Promise.allSettled(
    mergedCandidates.slice(0, searchQuery ? 36 : 48).map((candidate) => fetchPodcastShow(candidate))
  );

  const playableShows = hydratedShows
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .filter((show) => Boolean(show.latestEpisode?.audioUrl));

  const hydratedSlugs = new Set(playableShows.map((show) => show.slug));
  const fallbackShows = mergedCandidates
    .filter((candidate) => candidate.sourceProvider === "curated" && !hydratedSlugs.has(candidate.slug))
    .map(createFallbackShowFromCandidate);

  const allShows = [...playableShows, ...fallbackShows];

  const sections = buildPodcastSections(allShows);

  if (!searchQuery) {
    (
      [
        ["featured", sections.featured],
        ["science", sections.science],
        ["trueCrime", sections.trueCrime],
        ["arts", sections.arts],
        ["business", sections.business],
        ["sports", sections.sports],
        ["politics", sections.politics],
      ] as const
    ).forEach(([category, shows]) => {
      if (shows.some((show) => show.latestEpisode === null)) {
        console.log("PODCAST FALLBACK USED", {
          category,
          count: shows.filter((show) => show.latestEpisode === null).length,
        });
      }
    });
  }

  if (searchQuery) {
    console.log("PODCAST_SEARCH_COUNT", allShows.length);
  }

  console.log("PODCAST FINAL RENDER COUNT", allShows.length);

  return {
    shows: allShows,
    sections,
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

export async function fetchPodcastShowBySlug(podcastSlug: string) {
  const fallbackShow =
    buildStaticFallbackPodcastDirectory().shows.find((entry) => entry.slug === podcastSlug) ?? null;

  if (!fallbackShow) {
    return null;
  }

  const candidate = createCandidateFromFeed(
    PODCAST_FEEDS.find((entry) => entry.slug === podcastSlug) ?? {
      slug: fallbackShow.slug,
      title: fallbackShow.title,
      publisher: fallbackShow.publisher,
      category: fallbackShow.category,
      featured: fallbackShow.featured,
      feedUrl: fallbackShow.feedUrl,
    }
  );

  try {
    const hydratedShow = await fetchPodcastShow(candidate);
    return hydratedShow;
  } catch (error) {
    console.error("PODCAST SHOW LOAD FAILED", {
      podcastSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackShow;
  }
}
