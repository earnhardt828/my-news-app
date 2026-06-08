export const dynamic = "force-dynamic";
export const revalidate = 0;

import { fetchArticles as fetchCurrentProviderArticles } from "../../../lib/news/providers/current";

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

type CurrentsApiResponse = {
  news?: Array<{
    id?: string | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    image?: string | null;
    published?: string | null;
    category?: string[] | null;
    author?: string | null;
    source?: string | { name?: string | null } | null;
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
  provider: "current" | "nyt" | "currents";
};

const NYT_TOP_STORIES_HOME_SECTION = "home";

type NytFetchResult = {
  articles: AggregatedNewsArticle[];
  status: number | null;
  rawCount: number;
  imageCount: number;
  error: string | null;
};

type CurrentsFetchResult = {
  articles: AggregatedNewsArticle[];
  rawCount: number;
};

function interleaveProviderArticles(articles: AggregatedNewsArticle[]) {
  const currentQueue = articles.filter((article) => article.provider === "current");
  const nytQueue = articles.filter((article) => article.provider === "nyt");
  const currentsQueue = articles.filter((article) => article.provider === "currents");
  const interleaved: AggregatedNewsArticle[] = [];

  while (currentQueue.length > 0 || nytQueue.length > 0 || currentsQueue.length > 0) {
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (currentQueue.length > 0) {
      interleaved.push(currentQueue.shift()!);
    }
    if (nytQueue.length > 0) {
      interleaved.push(nytQueue.shift()!);
    }
    if (currentsQueue.length > 0) {
      interleaved.push(currentsQueue.shift()!);
    }
    if (currentsQueue.length > 0) {
      interleaved.push(currentsQueue.shift()!);
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

  if (/\.(m3u8|mp4|mp3|m4a|mov|avi|webm)(\?|#|$)/i.test(normalized)) {
    return false;
  }

  if (/(placeholder|default-image|avatar|logo|icon|blank)\b/i.test(normalized)) {
    return false;
  }

  if (/\.(jpg|jpeg|png|webp|avif|gif)(\?|#|$)/i.test(normalized)) {
    return true;
  }

  return /(image|images|img|media|photo|thumb|thumbnail|cdn|cloudfront|static|assets)\./i.test(
    normalized
  ) || /\/(image|images|img|media|photo|thumb|thumbnail)\//i.test(normalized);
}

function inferCategoryFromText(...values: Array<string | null | undefined>) {
  const haystack = values
    .map((value) => stripHtml(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return "trending";
  }

  if (/\b(entertainment|celebrity|movie|movies|tv|music|hollywood|box office|streaming)\b/.test(haystack)) {
    return "entertainment";
  }

  if (/\b(crime|police|investigation|arrest|court|trial|charges|shooting|suspect|homicide|fraud|theft)\b/.test(haystack)) {
    return "crime";
  }

  if (/\b(technology|tech|ai|artificial intelligence|apple|google|microsoft|cybersecurity|startup)\b/.test(haystack)) {
    return "tech";
  }

  if (/\b(business|economy|stock|stocks|market|markets|earnings|company|companies|finance)\b/.test(haystack)) {
    return "business";
  }

  if (/\b(politics|election|congress|senate|house|white house|policy|government|president|campaign)\b/.test(haystack)) {
    return "politics";
  }

  if (/\b(sports|nfl|nba|mlb|nhl|soccer|golf|tennis|espn|athletic|playoffs|championship)\b/.test(haystack)) {
    return "sports";
  }

  if (/\b(health|medical|medicine|disease|covid|hospital|doctor|wellness|mental health)\b/.test(haystack)) {
    return "health";
  }

  if (/\b(world|international|global|ukraine|israel|gaza|china|russia|europe|asia|middle east)\b/.test(haystack)) {
    return "world";
  }

  return "trending";
}

function normalizeCategoryValue(
  rawCategory: string | null | undefined,
  ...signals: Array<string | null | undefined>
) {
  const normalized = stripHtml(rawCategory).trim().toLowerCase();

  if (
    !normalized ||
    normalized === "general" ||
    normalized === "unknown" ||
    normalized === "news" ||
    normalized === "null" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
  ) {
    return inferCategoryFromText(rawCategory, ...signals);
  }

  if (["entertainment", "crime", "tech", "business", "politics", "sports", "health", "world", "trending"].includes(normalized)) {
    return normalized;
  }

  return inferCategoryFromText(rawCategory, ...signals);
}

function extractHostnameLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname === "thestar.com.my") {
      return "The Star";
    }

    return hostname;
  } catch {
    return "Currents";
  }
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
    category: normalizeCategoryValue(
      article.category,
      article.title,
      article.description,
      article.source,
      article.url
    ),
    publishedAt: article.publishedAt,
    time: "Recent",
    likes: 0,
    comments: [],
    provider: "current",
  };
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
        category: normalizeCategoryValue(
          category.trim() || "general",
          article.title,
          article.abstract,
          "The New York Times",
          article.url
        ),
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

async function fetchCurrentsArticles(category: string): Promise<CurrentsFetchResult> {
  const currentsKey = process.env.CURRENTS_API_KEY ?? "";

  if (!currentsKey) {
    return {
      articles: [],
      rawCount: 0,
    };
  }

  try {
    const requestUrl = "https://api.currentsapi.services/v1/latest-news";
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: currentsKey,
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return {
        articles: [],
        rawCount: 0,
      };
    }

    const payload = (await response.json()) as CurrentsApiResponse;
    const rawArticles = payload.news ?? [];
    const articles = rawArticles.flatMap((article, index) => {
      const title = stripHtml(article.title);
      const url = normalizeUrl(article.url);
      const imageUrl = article.image?.trim() ?? "";

      if (!title || !url || !hasRealImageUrl(imageUrl)) {
        return [];
      }

      const sourceLabel =
        stripHtml(
          typeof article.source === "string"
            ? article.source
            : article.source?.name ?? article.author
        ) || extractHostnameLabel(url);
      const articleCategory = normalizeCategoryValue(
        article.category?.find((value) => (value ?? "").trim())?.trim() || category.trim() || "general",
        article.title,
        article.description,
        sourceLabel,
        article.url
      );

      return [{
        id: hashArticleId(`currents:${article.id ?? url}:${index}`),
        title,
        description: stripHtml(article.description) || null,
        content: stripHtml(article.description) || null,
        source: sourceLabel,
        sourceName: sourceLabel,
        url,
        image: imageUrl,
        imageUrl,
        urlToImage: imageUrl,
        mediaContent: null,
        enclosureUrl: null,
        ogImage: null,
        twitterImage: null,
        thumbnail: null,
        category: articleCategory,
        publishedAt: article.published ?? null,
        time: "Recent",
        likes: 0,
        comments: [],
        provider: "currents",
      }] satisfies AggregatedNewsArticle[];
    });

    return {
      articles: articles.slice(0, 10),
      rawCount: rawArticles.length,
    };
  } catch (error) {
    return {
      articles: [],
      rawCount: 0,
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode")?.trim() || "trending";
  const query = searchParams.get("query")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.max(1, Math.min(30, Number(searchParams.get("pageSize") || "25")));
  const category = query || mode || "general";
  let nytArticles: AggregatedNewsArticle[] = [];
  let currentsArticles: AggregatedNewsArticle[] = [];

  const [currentArticles] = await Promise.all([
    fetchCurrentProviderArticles(category),
  ]);

  const nytResult = await fetchNytArticles(category);
  nytArticles = nytResult.articles;
  const currentsResult = await fetchCurrentsArticles(category);
  currentsArticles = currentsResult.articles;

  const currentMappedArticles = currentArticles.map(mapCurrentArticle);
  const mergedArticles = [
    ...currentMappedArticles,
    ...nytArticles,
    ...currentsArticles,
  ];
  const mappedArticles = dedupeArticles(mergedArticles);
  const interleavedArticles = interleaveProviderArticles(mappedArticles);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const articles = interleavedArticles.slice(startIndex, endIndex);
  const hasMore = endIndex < interleavedArticles.length;

  return Response.json({
    articles,
    nextPage: hasMore ? page + 1 : null,
    hasMore,
    page,
    pageSize,
  });
}
