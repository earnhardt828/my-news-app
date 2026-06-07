export const dynamic = "force-dynamic";
export const revalidate = 0;

import { fetchArticles as fetchCurrentProviderArticles } from "../../../lib/news/providers/current";

type GNewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: {
      name?: string | null;
    } | null;
  }>;
};

type NytTopStoriesResponse = {
  results?: Array<{
    title?: string | null;
    abstract?: string | null;
    url?: string | null;
    published_date?: string | null;
    multimedia?: Array<{
      url?: string | null;
      width?: number | null;
      height?: number | null;
    }> | null;
  }>;
};

type AggregatedNewsArticle = {
  id: number;
  title: string;
  description: string | null;
  content: string | null;
  source: string;
  sourceName: string;
  url: string;
  image: string;
  imageUrl: string;
  urlToImage: string;
  mediaContent: null;
  enclosureUrl: null;
  ogImage: null;
  twitterImage: null;
  thumbnail: null;
  category: string;
  publishedAt: string | null;
  time: string;
  likes: number;
  comments: null[];
  provider: "current" | "gnews" | "nyt";
};

const GNEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const NYT_TOP_STORIES_HOME_SECTION = "home";

type GnewsFetchResult = {
  articles: AggregatedNewsArticle[];
  status: number | null;
  rawCount: number;
  imageCount: number;
  error: string | null;
};

type NytFetchResult = {
  articles: AggregatedNewsArticle[];
  status: number | null;
  rawCount: number;
  imageCount: number;
  error: string | null;
};

let gnewsCache:
  | {
      fetchedAt: number;
      result: GnewsFetchResult;
    }
  | null = null;
let gnewsInflightRequest: Promise<GnewsFetchResult> | null = null;

function countProviders(articles: AggregatedNewsArticle[]) {
  return articles.reduce(
    (counts, article) => {
      if (article.provider === "current") {
        counts.current += 1;
      } else if (article.provider === "gnews") {
        counts.gnews += 1;
      } else if (article.provider === "nyt") {
        counts.nyt += 1;
      }

      return counts;
    },
    { current: 0, gnews: 0, nyt: 0 }
  );
}

function interleaveProviderArticles(articles: AggregatedNewsArticle[]) {
  const currentQueue = articles.filter((article) => article.provider === "current");
  const nytQueue = articles.filter((article) => article.provider === "nyt");
  const gnewsQueue = articles.filter((article) => article.provider === "gnews");
  const interleaved: AggregatedNewsArticle[] = [];

  while (currentQueue.length > 0 || nytQueue.length > 0 || gnewsQueue.length > 0) {
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (nytQueue.length > 0) {
      interleaved.push(nytQueue.shift()!);
    }
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (nytQueue.length > 0) {
      interleaved.push(nytQueue.shift()!);
    }
    if (gnewsQueue.length > 0) {
      interleaved.push(gnewsQueue.shift()!);
    }
  }

  return interleaved;
}

function hashArticleId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
}

function normalizeUrl(url: string | null | undefined) {
  if (!url?.trim()) {
    return "";
  }

  try {
    const parsed = new URL(url.trim());
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
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function normalizeTitle(title: string | null | undefined) {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function stripHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRealImageUrl(url: string | null | undefined) {
  const normalized = url?.trim() ?? "";

  if (!normalized) {
    return false;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return false;
  }

  return !/(placeholder|default-image|avatar|logo|icon|blank)\b/i.test(normalized);
}

function dedupeArticles(articles: AggregatedNewsArticle[]) {
  const result: AggregatedNewsArticle[] = [];
  const indexByKey = new Map<string, number>();

  articles.forEach((article) => {
    const normalizedUrl = normalizeUrl(article.url);
    const normalizedArticleTitle = normalizeTitle(article.title);
    const dedupeKey = normalizedUrl
      ? `url:${normalizedUrl.toLowerCase()}`
      : `title:${article.source.toLowerCase()}:${normalizedArticleTitle}`;
    const existingIndex = indexByKey.get(dedupeKey);

    if (existingIndex === undefined) {
      indexByKey.set(dedupeKey, result.length);
      result.push(article);
      return;
    }

    const existing = result[existingIndex];
    const existingTime = existing.publishedAt ? new Date(existing.publishedAt).getTime() : 0;
    const nextTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;

    if (nextTime > existingTime) {
      result[existingIndex] = article;
    }
  });

  return result;
}

function mapCurrentArticle(article: Awaited<ReturnType<typeof fetchCurrentProviderArticles>>[number]): AggregatedNewsArticle {
  return {
    id: article.id,
    title: article.title,
    description: article.description,
    content: article.description,
    source: article.source,
    sourceName: article.source,
    url: article.url,
    image: article.imageUrl,
    imageUrl: article.imageUrl,
    urlToImage: article.imageUrl,
    mediaContent: null,
    enclosureUrl: null,
    ogImage: null,
    twitterImage: null,
    thumbnail: null,
    category: article.category,
    publishedAt: article.publishedAt,
    time: "Recent",
    likes: 0,
    comments: [],
    provider: "current",
  };
}

function mapGnewsArticles(rawArticles: GNewsApiResponse["articles"], category: string) {
  return (rawArticles ?? []).flatMap((article, index) => {
    const title = stripHtml(article.title);
    const url = normalizeUrl(article.url);
    const imageUrl = article.image?.trim() ?? "";

    if (!title || !url || !hasRealImageUrl(imageUrl)) {
      return [];
    }

    return [{
      id: hashArticleId(`gnews:${url}:${index}`),
      title,
      description: stripHtml(article.description) || null,
      content: stripHtml(article.description) || null,
      source: article.source?.name?.trim() || "GNews",
      sourceName: article.source?.name?.trim() || "GNews",
      url,
      image: imageUrl,
      imageUrl,
      urlToImage: imageUrl,
      mediaContent: null,
      enclosureUrl: null,
      ogImage: null,
      twitterImage: null,
      thumbnail: null,
      category: category.trim() || "general",
      publishedAt: article.publishedAt ?? null,
      time: "Recent",
      likes: 0,
      comments: [],
      provider: "gnews",
    }] satisfies AggregatedNewsArticle[];
  });
}

function getLargestNytImageUrl(
  multimedia:
    | Array<{
        url?: string | null;
        width?: number | null;
        height?: number | null;
      }>
    | null
    | undefined
) {
  const candidates = (multimedia ?? [])
    .map((item) => ({
      url: item?.url?.trim() ?? "",
      area: (item?.width ?? 0) * (item?.height ?? 0),
    }))
    .filter((item) => hasRealImageUrl(item.url))
    .sort((left, right) => right.area - left.area);

  const selected = candidates[0]?.url ?? "";

  if (!selected) {
    return "";
  }

  if (/^https?:\/\//i.test(selected)) {
    return selected;
  }

  return `https://static01.nyt.com/${selected.replace(/^\/+/, "")}`;
}

async function fetchNytArticles(category: string): Promise<NytFetchResult> {
  const nytKey = process.env.NYT_API_KEY ?? "";

  if (!nytKey) {
    return {
      articles: [],
      status: null,
      rawCount: 0,
      imageCount: 0,
      error: "Missing NYT_API_KEY",
    };
  }

  try {
    const requestUrl = `https://api.nytimes.com/svc/topstories/v2/${NYT_TOP_STORIES_HOME_SECTION}.json?api-key=${nytKey}`;
    const response = await fetch(requestUrl, {
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return {
        articles: [],
        status: response.status,
        rawCount: 0,
        imageCount: 0,
        error: `NYT request failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as NytTopStoriesResponse;
    const rawArticles = payload.results ?? [];
    const articles = rawArticles.flatMap((article, index) => {
      const title = stripHtml(article.title);
      const url = normalizeUrl(article.url);
      const imageUrl = getLargestNytImageUrl(article.multimedia);

      if (!title || !url || !hasRealImageUrl(imageUrl)) {
        return [];
      }

      return [{
        id: hashArticleId(`nyt:${url}:${index}`),
        title,
        description: stripHtml(article.abstract) || null,
        content: stripHtml(article.abstract) || null,
        source: "The New York Times",
        sourceName: "The New York Times",
        url,
        image: imageUrl,
        imageUrl,
        urlToImage: imageUrl,
        mediaContent: null,
        enclosureUrl: null,
        ogImage: null,
        twitterImage: null,
        thumbnail: null,
        category: category.trim() || "general",
        publishedAt: article.published_date ?? null,
        time: "Recent",
        likes: 0,
        comments: [],
        provider: "nyt",
      }] satisfies AggregatedNewsArticle[];
    });

    return {
      articles: articles.slice(0, 5),
      status: response.status,
      rawCount: rawArticles.length,
      imageCount: articles.length,
      error: null,
    };
  } catch (error) {
    return {
      articles: [],
      status: null,
      rawCount: 0,
      imageCount: 0,
      error: error instanceof Error ? error.message : "Unknown NYT fetch error",
    };
  }
}

async function fetchGnewsWithCache(requestUrl: string, category: string): Promise<GnewsFetchResult> {
  const now = Date.now();

  if (gnewsCache && now - gnewsCache.fetchedAt < GNEWS_CACHE_TTL_MS) {
    console.log("GNEWS_CACHE_HIT", {
      ageMs: now - gnewsCache.fetchedAt,
      imageCount: gnewsCache.result.imageCount,
    });
    return gnewsCache.result;
  }

  console.log("GNEWS_CACHE_MISS", {
    hasCache: Boolean(gnewsCache),
    requestUrl,
  });

  if (gnewsInflightRequest) {
    return gnewsInflightRequest;
  }

  gnewsInflightRequest = (async () => {
    try {
      const response = await fetch(requestUrl, {
        next: { revalidate: 0 },
      });

      if (response.status === 429) {
        console.log("GNEWS_RATE_LIMITED", { requestUrl });

        if (gnewsCache) {
          return {
            ...gnewsCache.result,
            status: 429,
            error: "GNews rate limited; using cached results",
          };
        }

        return {
          articles: [],
          status: 429,
          rawCount: 0,
          imageCount: 0,
          error: "GNews rate limited",
        };
      }

      if (!response.ok) {
        return {
          articles: [],
          status: response.status,
          rawCount: 0,
          imageCount: 0,
          error: `GNews request failed with status ${response.status}`,
        };
      }

      const payload = (await response.json()) as GNewsApiResponse;
      const rawArticles = payload.articles ?? [];
      const articles = mapGnewsArticles(rawArticles, category);
      const result = {
        articles,
        status: response.status,
        rawCount: rawArticles.length,
        imageCount: articles.length,
        error: null,
      };

      gnewsCache = {
        fetchedAt: Date.now(),
        result,
      };

      return result;
    } catch (error) {
      return {
        articles: [],
        status: null,
        rawCount: 0,
        imageCount: 0,
        error: error instanceof Error ? error.message : "Unknown GNews fetch error",
      };
    } finally {
      gnewsInflightRequest = null;
    }
  })();

  return gnewsInflightRequest;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode")?.trim() || "trending";
  const query = searchParams.get("query")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.max(1, Math.min(30, Number(searchParams.get("pageSize") || "25")));
  const category = query || mode || "general";
  const gnewsKey = process.env.GNEWS_API_KEY ?? "";
  const gnewsRequestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${gnewsKey}`;
  let gnewsStatus: number | null = null;
  let gnewsRawCount = 0;
  let gnewsImageCount = 0;
  let gnewsError: string | null = null;
  let gnewsArticles: AggregatedNewsArticle[] = [];
  const nytKey = process.env.NYT_API_KEY ?? "";
  let nytStatus: number | null = null;
  let nytRawCount = 0;
  let nytImageCount = 0;
  let nytError: string | null = null;
  let nytArticles: AggregatedNewsArticle[] = [];

  const [currentArticles] = await Promise.all([
    fetchCurrentProviderArticles(category),
  ]);

  if (!gnewsKey) {
    gnewsError = "Missing GNEWS_API_KEY";
  } else {
    const gnewsResult = await fetchGnewsWithCache(gnewsRequestUrl, category);
    gnewsStatus = gnewsResult.status;
    gnewsRawCount = gnewsResult.rawCount;
    gnewsImageCount = gnewsResult.imageCount;
    gnewsError = gnewsResult.error;
    gnewsArticles = gnewsResult.articles;
  }

  const nytResult = await fetchNytArticles(category);
  nytStatus = nytResult.status;
  nytRawCount = nytResult.rawCount;
  nytImageCount = nytResult.imageCount;
  nytError = nytResult.error;
  nytArticles = nytResult.articles;

  const currentMappedArticles = currentArticles.map(mapCurrentArticle);
  const mergedArticles = [
    ...currentMappedArticles,
    ...nytArticles,
    ...gnewsArticles,
  ];
  const mappedArticles = dedupeArticles(mergedArticles);
  const interleavedArticles = interleaveProviderArticles(mappedArticles);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const articles = interleavedArticles.slice(startIndex, endIndex);
  const hasMore = endIndex < interleavedArticles.length;
  const finalBeforeSliceProviderCounts = countProviders(interleavedArticles);
  const finalProviderCounts = countProviders(articles);

  return Response.json({
    articles,
    nextPage: hasMore ? page + 1 : null,
    hasMore,
    page,
    pageSize,
    debug: {
      gnewsKeyPresent: Boolean(gnewsKey),
      gnewsKeyLength: gnewsKey.length,
      gnewsStatus,
      gnewsRawCount,
      gnewsImageCount,
      gnewsError,
      nytKeyPresent: Boolean(nytKey),
      nytStatus,
      nytRawCount,
      nytImageCount,
      nytError,
      currentCount: currentMappedArticles.length,
      gnewsCount: gnewsArticles.length,
      nytCount: nytArticles.length,
      totalBeforeCaps: interleavedArticles.length,
      totalAfterCaps: articles.length,
      finalBeforeSliceProviderCounts,
      finalProviderCounts,
    },
  });
}
