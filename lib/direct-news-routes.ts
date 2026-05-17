type DirectFeedArticle = {
  id: number;
  title: string;
  source: string;
  sourceName: string;
  category: string;
  time: string;
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  likes: number;
  comments: null[];
};

type RssFeedConfig = {
  url: string;
  source: string;
  category: string;
};

type ProviderArticle = {
  title?: string | null;
  description?: string | null;
  content?: string | null;
  url?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  urlToImage?: string | null;
  thumbnail?: string | null;
  media?: string | { url?: string | null } | null;
  mediaContent?: string | null;
  enclosure?: { url?: string | null } | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  publishedAt?: string | null;
  pubDate?: string | null;
  source?: { name?: string | null } | null;
  source_name?: string | null;
  source_id?: string | null;
  category?: string[] | string | null;
};

type GNewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    content?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: { name?: string | null } | null;
  }>;
};

type NewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    content?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
    source?: { name?: string | null } | null;
  }>;
};

type NewsDataApiResponse = {
  results?: Array<{
    title?: string | null;
    description?: string | null;
    content?: string | null;
    link?: string | null;
    image_url?: string | null;
    source_id?: string | null;
    source_name?: string | null;
    pubDate?: string | null;
    category?: string[] | null;
  }>;
};

const NEWS_API_KEY =
  process.env.NEWS_API_KEY ??
  process.env.NEWSAPI_KEY ??
  process.env.NEXT_PUBLIC_NEWS_API_KEY ??
  "";
const GNEWS_API_KEY = process.env.GNEWS_API_KEY ?? "";
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? "";
const DIRECT_ROUTE_FETCH_TIMEOUT_MS = 8000;

function hashArticleId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function stripHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractXmlTag(block: string, tagName: string) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return decodeHtml(block.match(regex)?.[1] ?? "");
}

function extractXmlAttr(block: string, tagName: string, attrName: string) {
  const regex = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*>`, "i");
  return decodeHtml(block.match(regex)?.[1] ?? "");
}

function extractImageFromDescription(description: string) {
  const srcMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  return srcMatch?.[1] ?? "";
}

function normalizeUrl(rawUrl: string | null | undefined) {
  if (!rawUrl?.trim()) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString().toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function normalizeTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DIRECT_ROUTE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildArticle(
  input: ProviderArticle,
  options: {
    source: string;
    category: string;
    uniqueSeed: string;
  }
) {
  const title = stripHtml(input.title);
  if (!title) {
    return null;
  }

  const providerImage =
    typeof input.media === "string"
      ? input.media
      : typeof input.media === "object" && input.media?.url
        ? input.media.url
        : null;

  const url = input.url?.trim() || null;
  const source =
    input.source?.name?.trim() ||
    input.source_name?.trim() ||
    options.source;
  const description = stripHtml(input.description);
  const content = stripHtml(input.content);
  const publishedAt = input.publishedAt ?? input.pubDate ?? null;
  const category = Array.isArray(input.category)
    ? input.category[0] ?? options.category
    : input.category || options.category;

  return {
    id: hashArticleId(`${options.uniqueSeed}-${url || title}`),
    title,
    description: description || null,
    content: content || description || null,
    source,
    sourceName: source,
    url,
    image: input.image ?? input.imageUrl ?? input.image_url ?? input.urlToImage ?? providerImage,
    imageUrl: input.imageUrl ?? input.image_url ?? input.image ?? providerImage,
    urlToImage: input.urlToImage ?? input.image ?? input.imageUrl ?? input.image_url ?? providerImage,
    mediaContent: input.mediaContent ?? providerImage,
    enclosureUrl: input.enclosure?.url ?? input.enclosureUrl ?? null,
    ogImage: input.ogImage ?? null,
    twitterImage: input.twitterImage ?? null,
    thumbnail: input.thumbnail ?? null,
    category: String(category),
    publishedAt,
    time: "Recent",
    likes: 0,
    comments: [],
  } satisfies DirectFeedArticle;
}

function parseRssItems(xml: string, fallbackFeed: RssFeedConfig) {
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];

  return itemMatches
    .map((match, index) => {
      const block = match[0];
      const description = extractXmlTag(block, "description");
      const mediaContentUrl = extractXmlAttr(block, "media:content", "url");
      const enclosureUrl = extractXmlAttr(block, "enclosure", "url");
      const mediaThumbnailUrl = extractXmlAttr(block, "media:thumbnail", "url");
      const descriptionImageUrl = extractImageFromDescription(description) || null;
      const mediaUrl =
        mediaContentUrl || enclosureUrl || mediaThumbnailUrl || descriptionImageUrl || null;

      return buildArticle(
        {
          title: stripHtml(extractXmlTag(block, "title")),
          description: stripHtml(description),
          content: stripHtml(extractXmlTag(block, "content:encoded") || description),
          url: extractXmlTag(block, "link"),
          publishedAt: extractXmlTag(block, "pubDate"),
          media: mediaUrl,
          enclosure: enclosureUrl ? { url: enclosureUrl } : null,
          thumbnail: mediaThumbnailUrl,
          imageUrl: descriptionImageUrl,
          category: stripHtml(extractXmlTag(block, "category")) || fallbackFeed.category,
          source_name: fallbackFeed.source,
        },
        {
          source: fallbackFeed.source,
          category: fallbackFeed.category,
          uniqueSeed: `rss-${fallbackFeed.source}-${index}`,
        }
      );
    })
    .filter(Boolean) as DirectFeedArticle[];
}

async function fetchRssArticles(feeds: RssFeedConfig[]) {
  const responses = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetchWithTimeout(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "User-Agent": "GraffitiNews/1.0 (+https://graffiti.news)",
        },
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`RSS request failed for ${feed.source} with status ${response.status}`);
      }

      return parseRssItems(await response.text(), feed);
    })
  );

  return responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    console.error("DIRECT RSS ERROR", result.reason);
    return [];
  });
}

async function fetchNewsApiQuery(query: string, pageSize: number) {
  if (!NEWS_API_KEY) {
    return [] as DirectFeedArticle[];
  }

  const response = await fetchWithTimeout(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&page=1&pageSize=${pageSize}`,
    {
      headers: {
        "X-Api-Key": NEWS_API_KEY,
      },
      next: { revalidate: 600 },
    }
  );

  if (!response.ok) {
    throw new Error(`NewsAPI request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NewsApiResponse;
  return (payload.articles ?? [])
    .map((article, index) =>
      buildArticle(article, {
        source: article.source?.name?.trim() || "NewsAPI",
        category: "Search",
        uniqueSeed: `newsapi-${query}-${index}`,
      })
    )
    .filter(Boolean) as DirectFeedArticle[];
}

async function fetchGNewsQuery(query: string, pageSize: number) {
  if (!GNEWS_API_KEY) {
    return [] as DirectFeedArticle[];
  }

  const response = await fetchWithTimeout(
    `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=us&max=${Math.min(
      pageSize,
      25
    )}&page=1&expand=content&token=${GNEWS_API_KEY}`,
    {
      next: { revalidate: 600 },
    }
  );

  if (!response.ok) {
    throw new Error(`GNews request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GNewsApiResponse;
  return (payload.articles ?? [])
    .map((article, index) =>
      buildArticle(article, {
        source: article.source?.name?.trim() || "GNews",
        category: "Search",
        uniqueSeed: `gnews-${query}-${index}`,
      })
    )
    .filter(Boolean) as DirectFeedArticle[];
}

async function fetchNewsDataQuery(query: string, pageSize: number) {
  if (!NEWSDATA_API_KEY) {
    return [] as DirectFeedArticle[];
  }

  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", NEWSDATA_API_KEY);
  url.searchParams.set("language", "en");
  url.searchParams.set("country", "us");
  url.searchParams.set("q", query);

  const response = await fetchWithTimeout(url.toString(), {
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`NewsData request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NewsDataApiResponse;
  return (payload.results ?? [])
    .slice(0, pageSize)
    .map((article, index) =>
      buildArticle(
        {
          title: article.title,
          description: article.description,
          content: article.content,
          url: article.link,
          image_url: article.image_url,
          source_name: article.source_name ?? article.source_id,
          pubDate: article.pubDate,
          category: article.category,
        },
        {
          source: article.source_name?.trim() || article.source_id?.trim() || "NewsData.io",
          category: "Search",
          uniqueSeed: `newsdata-${query}-${index}`,
        }
      )
    )
    .filter(Boolean) as DirectFeedArticle[];
}

function dedupeArticles(articles: DirectFeedArticle[]) {
  const result: DirectFeedArticle[] = [];
  const indexByKey = new Map<string, number>();

  articles.forEach((article) => {
    const normalizedUrl = normalizeUrl(article.url);
    const normalizedTitle = normalizeTitle(article.title);
    const dedupeKey = normalizedUrl
      ? `url:${normalizedUrl}`
      : `title:${article.source.toLowerCase()}:${normalizedTitle}`;
    const existingIndex = indexByKey.get(dedupeKey);

    if (existingIndex === undefined) {
      indexByKey.set(dedupeKey, result.length);
      result.push(article);
      return;
    }

    const existing = result[existingIndex];
    const existingTime = existing.publishedAt ? new Date(existing.publishedAt).getTime() : 0;
    const nextTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
    const existingHasImage = Boolean(existing.image || existing.imageUrl || existing.urlToImage);
    const nextHasImage = Boolean(article.image || article.imageUrl || article.urlToImage);

    if (nextTime > existingTime || (!existingHasImage && nextHasImage)) {
      result[existingIndex] = article;
    }
  });

  return result;
}

export async function fetchDirectArticlePool(options: {
  queries: string[];
  rssFeeds?: RssFeedConfig[];
  pageSize?: number;
}) {
  const pageSize = options.pageSize ?? 10;
  const rssArticles = options.rssFeeds?.length ? await fetchRssArticles(options.rssFeeds) : [];
  const queryResponses = await Promise.allSettled(
    options.queries.map((query) =>
      Promise.all([
        fetchNewsApiQuery(query, pageSize),
        fetchGNewsQuery(query, pageSize),
        fetchNewsDataQuery(query, pageSize),
      ])
    )
  );

  const queryArticles = queryResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.flatMap((group) => group) : []
  );

  return dedupeArticles([...rssArticles, ...queryArticles]).sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export type { DirectFeedArticle, RssFeedConfig };
