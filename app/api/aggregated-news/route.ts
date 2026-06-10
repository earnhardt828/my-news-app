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

type GuardianContentResponse = {
  response?: {
    results?: Array<{
      id?: string | null;
      webTitle?: string | null;
      webUrl?: string | null;
      webPublicationDate?: string | null;
      sectionName?: string | null;
      fields?: {
        thumbnail?: string | null;
        trailText?: string | null;
        headline?: string | null;
      } | null;
    }>;
  };
};

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
  provider: "current" | "nyt" | "currents" | "guardian" | "gnews";
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

type GuardianFetchResult = {
  articles: AggregatedNewsArticle[];
  rawCount: number;
};

type GNewsFetchResult = {
  articles: AggregatedNewsArticle[];
  rawCount: number;
};

const NYT_PROVIDER_CAP = 20;
const CURRENTS_PROVIDER_CAP = 40;
const GUARDIAN_PROVIDER_CAP = 30;
const GNEWS_PROVIDER_CAP = 10;
const FINAL_FEED_PAGE_SIZE_CAP = 100;
const CURRENTS_PAGE_SIZE = 50;
const CURRENTS_MAX_PAGES = 3;
const GNEWS_CACHE_TTL_MS = 45 * 60 * 1000;

let gnewsCache: {
  savedAt: number;
  articles: AggregatedNewsArticle[];
  rawCount: number;
} | null = null;

function interleaveProviderArticles(articles: AggregatedNewsArticle[]) {
  const currentQueue = articles.filter((article) => article.provider === "current");
  const nytQueue = articles.filter((article) => article.provider === "nyt");
  const currentsQueue = articles.filter((article) => article.provider === "currents");
  const guardianQueue = articles.filter((article) => article.provider === "guardian");
  const gnewsQueue = articles.filter((article) => article.provider === "gnews");
  const interleaved: AggregatedNewsArticle[] = [];

  while (
    currentQueue.length > 0 ||
    nytQueue.length > 0 ||
    currentsQueue.length > 0 ||
    guardianQueue.length > 0 ||
    gnewsQueue.length > 0
  ) {
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
    if (guardianQueue.length > 0) {
      interleaved.push(guardianQueue.shift()!);
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

  const politicsTerms =
    /\b(trump|biden|election|congress|senate|house|white house|policy|government|president|campaign|mayor|governor|supreme court|politic|political race)\b/.test(
      haystack
    );
  const worldConflictTerms =
    /\b(israel|gaza|hezbollah|lebanon|beirut|hamas|iran|ukraine|russia|war|wars|conflict|military|missile|bomb|bombs|bombing|strike|strikes|airstrike|airstrikes|troops|cease-fire|ceasefire|middle east|world leaders|foreign policy|diplomat|diplomacy)\b/.test(
      haystack
    );
  const sportsLeagueTerms =
    /\b(nba|nfl|mlb|nhl|wnba|ncaa|nascar|ufc|mma|world cup|college world series|super bowl|stanley cup|final four)\b/.test(
      haystack
    );
  const sportsGameTerms =
    /\b(soccer|football|baseball|basketball|tennis|golf|boxing|playoff|playoffs|finals|scores|scoreboard|game|match|coach|player|team)\b/.test(
      haystack
    );
  const sportsTeamTerms =
    /\b(knicks|cubs|yankees|mets|dodgers|lakers|celtics|heat|cowboys|chiefs|eagles|49ers|rangers|bruins|oilers|panthers|korda)\b/.test(
      haystack
    );
  const sportsSourceTerms =
    /\b(espn|sportscenter|bleacher report|yahoo sports|cbs sports|nbc sports|fox sports|ap sports|reuters sports|bbc sport|the athletic|sports illustrated)\b/.test(
      haystack
    );
  const sportsTerms =
    sportsLeagueTerms ||
    sportsTeamTerms ||
    ((sportsGameTerms || sportsSourceTerms) && !worldConflictTerms);
  const crimeTerms =
    /\b(crime|police|investigation|arrest|court|trial|charges|shooting|suspect|homicide|fraud|theft|lawsuit|federal prosecutors)\b/.test(
      haystack
    );
  const scienceTerms =
    /\b(science|research|study|scientists|discovery|nasa|space|astronomy|biology|physics|chemistry|climate science|medicine research|medical research|nature\b|science journal|science magazine|telescope|galaxy|asteroid|planet)\b/.test(
      haystack
    );
  const entertainmentSourceTerms =
    /\b(variety|deadline|hollywood reporter|e! news|e news|page six|billboard|rolling stone|people|tmz|entertainment tonight|access hollywood|extra|vulture|indiewire|collider|thewrap|pitchfork|tvline)\b/.test(
      haystack
    );
  const entertainmentContentTerms =
    /\b(entertainment|movie|movies|film|tv|television|series|streaming|music|celebrity|celebrities|awards show|awards|theater|theatre|hollywood|actor|actors|actress|actresses|concert|tour|album|grammys|oscars|tony awards|emmys|pop culture|box office|broadway|show|singer|band|star|red carpet)\b/.test(
      haystack
    );
  const antiEntertainmentTerms =
    /\b(fcc|chairman|trump|biden|politics|political|election|campaign|congress|senate|court|lawsuit|government|mayor|charged|police|sports|nba|nfl|mlb|nhl|wnba|soccer|football|baseball|basketball|tennis|golf|viral news|breaking news|weather)\b/.test(
      haystack
    );

  if (politicsTerms) {
    return "politics";
  }

  if (worldConflictTerms) {
    return "world";
  }

  if (sportsTerms) {
    return "sports";
  }

  if (crimeTerms) {
    return "crime";
  }

  if (scienceTerms) {
    return "science";
  }

  if (/\b(technology|tech|ai|artificial intelligence|apple|google|microsoft|cybersecurity|startup|software|app|apps|semiconductor|chip|chips|robotics|device|devices)\b/.test(haystack)) {
    return "tech";
  }

  if (/\b(business|economy|stock|stocks|market|markets|earnings|company|companies|finance)\b/.test(haystack)) {
    return "business";
  }

  if (entertainmentContentTerms && !antiEntertainmentTerms) {
    return "entertainment";
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

  if (["entertainment", "crime", "tech", "science", "business", "politics", "sports", "health", "world", "trending"].includes(normalized)) {
    return normalized;
  }

  return inferCategoryFromText(rawCategory, ...signals);
}

function isArticleValidForCategory(article: AggregatedNewsArticle, requestedCategory: string) {
  const normalizedCategory = normalizeCategoryValue(requestedCategory, requestedCategory);

  if (!normalizedCategory) {
    return true;
  }

  const haystack = [
    article.title,
    article.description,
    article.source,
    article.sourceName,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .map((value) => stripHtml(value))
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  switch (normalizedCategory) {
    case "sports": {
      const hasSportsTerms =
        /\b(nba|nfl|mlb|nhl|wnba|ncaa|nascar|mls|fifa|world cup|basketball|football|baseball|soccer|tennis|golf|hockey|racing|boxing|ufc|game|match|finals|playoffs|tournament|score|scores|coach|player|team|knicks|cubs|yankees|dodgers|lakers|celtics|panthers|hornets|braves|college world series|korda)\b/.test(
          haystack
        );
      const hasRejectedTerms =
        /\b(war|bombing|bomb|israel|iran|hezbollah|gaza|beirut|election|mayor|trump|congress)\b/.test(
          haystack
        ) && !/\b(sports lawsuit|league lawsuit|player lawsuit|coach lawsuit|ufc lawsuit|ncaa lawsuit)\b/.test(haystack);
      return hasSportsTerms && !hasRejectedTerms;
    }
    case "entertainment": {
      const hasEntertainmentContentTerms =
        /\b(movie|film|tv|television|series|streaming|actor|actress|celebrity|music|concert|album|tour|awards|oscars|grammys|tony awards|broadway|hollywood|theater|theatre|show|singer|band|star|red carpet)\b/.test(
          haystack
        );
      const hasEntertainmentSourceTerms =
        /\b(variety|deadline|hollywood reporter|e! news|people|billboard|rolling stone|page six|tmz)\b/.test(
          haystack
        );
      const hasRejectedTerms =
        /\b(fcc|chairman|trump|court|lawsuit|mayor|election|government|campaign|police|war|crime|finance|congress|senate|white house)\b/.test(
          haystack
        );
      return hasEntertainmentContentTerms && !hasRejectedTerms && (hasEntertainmentSourceTerms || hasEntertainmentContentTerms);
    }
    case "crime":
      return /\b(arrest|charged|murder|shooting|stabbing|police|suspect|court|trial|prison|fraud|theft|fbi|doj|lawsuit)\b/.test(
        haystack
      );
    case "tech":
      return (
        /\b(ai|software|app|apps|apple|google|microsoft|tesla|chip|chips|semiconductor|cybersecurity|data breach|startup|robot|robotics|device|devices|openai|nvidia)\b/.test(
          haystack
        ) &&
        !/\b(nasa|astronomy|biology|physics|chemistry|nature\b|science journal|science magazine|scientists|medical research|researchers|space telescope|study finds|climate science)\b/.test(
          haystack
        )
      );
    case "science":
      return /\b(research|study|scientists|discovery|nasa|space|astronomy|climate science|biology|physics|chemistry|medicine research|medical research|nature\b|science journal|science magazine|telescope|galaxy|asteroid|planet)\b/.test(
        haystack
      );
    case "world":
      return /\b(world|international|foreign affairs|global|war|ukraine|russia|china|gaza|israel|europe|asia|middle east|beirut|hezbollah|iran)\b/.test(
        haystack
      );
    case "politics":
      return /\b(election|government|congress|president|mayor|policy|campaign|senate|house|white house|governor|politics?)\b/.test(
        haystack
      );
    case "business":
      return /\b(markets?|companies|economy|finance|stocks?|earnings|business|trade|tariff|inflation|jobs report)\b/.test(
        haystack
      );
    case "health":
      return /\b(medicine|medical|disease|fitness|nutrition|drugs?|hospital|doctor|vaccine|health|wellness)\b/.test(
        haystack
      );
    case "trending":
      return true;
    default:
      return article.category === normalizedCategory;
  }
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
      articles: articles.slice(0, NYT_PROVIDER_CAP),
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
    const collectedArticles: AggregatedNewsArticle[] = [];
    let rawCount = 0;

    for (let pageNumber = 1; pageNumber <= CURRENTS_MAX_PAGES; pageNumber += 1) {
      const requestUrl = new URL("https://api.currentsapi.services/v1/latest-news");
      requestUrl.searchParams.set("page_number", String(pageNumber));
      requestUrl.searchParams.set("page_size", String(CURRENTS_PAGE_SIZE));
      requestUrl.searchParams.set("language", "en");

      const response = await fetch(requestUrl.toString(), {
        headers: {
          Authorization: currentsKey,
        },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        break;
      }

      const payload = (await response.json()) as CurrentsApiResponse;
      const rawArticles = payload.news ?? [];
      rawCount += rawArticles.length;

      const pageArticles = rawArticles.flatMap((article, index) => {
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
          id: hashArticleId(`currents:${pageNumber}:${article.id ?? url}:${index}`),
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

      collectedArticles.push(...pageArticles);

      if (rawArticles.length < CURRENTS_PAGE_SIZE || collectedArticles.length >= CURRENTS_PROVIDER_CAP) {
        break;
      }
    }

    return {
      articles: dedupeArticles(collectedArticles).slice(0, CURRENTS_PROVIDER_CAP),
      rawCount,
    };
  } catch (error) {
    return {
      articles: [],
      rawCount: 0,
    };
  }
}

async function fetchGuardianArticles(category: string): Promise<GuardianFetchResult> {
  const guardianKey = process.env.GUARDIAN_API_KEY ?? "";

  if (!guardianKey) {
    return {
      articles: [],
      rawCount: 0,
    };
  }

  try {
    const requestUrl = new URL("https://content.guardianapis.com/search");
    requestUrl.searchParams.set("api-key", guardianKey);
    requestUrl.searchParams.set("page-size", "50");
    requestUrl.searchParams.set("order-by", "newest");
    requestUrl.searchParams.set("show-fields", "thumbnail,trailText,headline");
    requestUrl.searchParams.set("lang", "en");

    const normalizedCategory = normalizeCategoryValue(category, category);
    if (normalizedCategory && normalizedCategory !== "trending") {
      requestUrl.searchParams.set("q", normalizedCategory);
    }

    const response = await fetch(requestUrl.toString(), {
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return {
        articles: [],
        rawCount: 0,
      };
    }

    const payload = (await response.json()) as GuardianContentResponse;
    const rawArticles = payload.response?.results ?? [];
    const articles = rawArticles.flatMap((article, index) => {
      const title = stripHtml(article.fields?.headline || article.webTitle);
      const url = normalizeUrl(article.webUrl);
      const imageUrl = article.fields?.thumbnail?.trim() ?? "";

      if (!title || !url || !hasRealImageUrl(imageUrl)) {
        return [];
      }

      const sourceLabel = "The Guardian";

      return [{
        id: hashArticleId(`guardian:${article.id ?? url}:${index}`),
        title,
        description: stripHtml(article.fields?.trailText) || null,
        content: stripHtml(article.fields?.trailText) || null,
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
        category: normalizeCategoryValue(
          article.sectionName || category || "general",
          article.webTitle,
          article.fields?.trailText,
          sourceLabel,
          article.webUrl
        ),
        publishedAt: article.webPublicationDate ?? null,
        time: "Recent",
        likes: 0,
        comments: [],
        provider: "guardian",
      }] satisfies AggregatedNewsArticle[];
    });

    return {
      articles: dedupeArticles(articles).slice(0, GUARDIAN_PROVIDER_CAP),
      rawCount: rawArticles.length,
    };
  } catch {
    return {
      articles: [],
      rawCount: 0,
    };
  }
}

function getCachedGnewsResult() {
  if (!gnewsCache) {
    return null;
  }

  if (Date.now() - gnewsCache.savedAt > GNEWS_CACHE_TTL_MS) {
    gnewsCache = null;
    return null;
  }

  return gnewsCache;
}

async function fetchGnewsArticles(category: string): Promise<GNewsFetchResult> {
  const gnewsKey = process.env.GNEWS_API_KEY ?? "";

  if (!gnewsKey) {
    return {
      articles: [],
      rawCount: 0,
    };
  }

  const cached = getCachedGnewsResult();
  if (cached) {
    return {
      articles: cached.articles,
      rawCount: cached.rawCount,
    };
  }

  try {
    const requestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${gnewsKey}`;
    const response = await fetch(requestUrl, {
      next: { revalidate: 0 },
    });

    if (response.status === 429) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("GNEWS RATE LIMITED", 429);
      }
      return {
        articles: [],
        rawCount: 0,
      };
    }

    if (!response.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("GNEWS WARN", response.status);
      }
      return {
        articles: [],
        rawCount: 0,
      };
    }

    const payload = (await response.json()) as GNewsApiResponse;
    const rawArticles = payload.articles ?? [];
    const articles = rawArticles.flatMap((article, index) => {
      const title = stripHtml(article.title);
      const url = normalizeUrl(article.url);
      const imageUrl = article.image?.trim() ?? "";
      const sourceLabel = stripHtml(article.source?.name) || "GNews";

      if (!title || !url || !hasRealImageUrl(imageUrl)) {
        return [];
      }

      return [{
        id: hashArticleId(`gnews:${url}:${index}`),
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
        category: normalizeCategoryValue(
          category.trim() || "general",
          article.title,
          article.description,
          sourceLabel,
          article.url
        ),
        publishedAt: article.publishedAt ?? null,
        time: "Recent",
        likes: 0,
        comments: [],
        provider: "gnews",
      }] satisfies AggregatedNewsArticle[];
    });

    const dedupedArticles = dedupeArticles(articles)
      .filter((article) => isArticleValidForCategory(article, article.category))
      .slice(0, GNEWS_PROVIDER_CAP);

    gnewsCache = {
      savedAt: Date.now(),
      articles: dedupedArticles,
      rawCount: rawArticles.length,
    };

    return {
      articles: dedupedArticles,
      rawCount: rawArticles.length,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "GNEWS WARN",
        error instanceof Error ? error.message : "Unknown GNews error"
      );
    }
    return {
      articles: [],
      rawCount: 0,
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode")?.trim() || "trending";
  const requestedCategory = searchParams.get("category")?.trim() || "";
  const query = searchParams.get("query")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.max(
    1,
    Math.min(FINAL_FEED_PAGE_SIZE_CAP, Number(searchParams.get("pageSize") || String(FINAL_FEED_PAGE_SIZE_CAP)))
  );
  const category = requestedCategory || query || mode || "general";
  const normalizedRequestedCategory = requestedCategory
    ? normalizeCategoryValue(requestedCategory, requestedCategory)
    : "";
  let nytArticles: AggregatedNewsArticle[] = [];
  let currentsArticles: AggregatedNewsArticle[] = [];
  let guardianArticles: AggregatedNewsArticle[] = [];
  let gnewsArticles: AggregatedNewsArticle[] = [];

  const [currentArticles] = await Promise.all([
    fetchCurrentProviderArticles(category),
  ]);

  const nytResult = await fetchNytArticles(category);
  nytArticles = nytResult.articles;
  const currentsResult = await fetchCurrentsArticles(category);
  currentsArticles = currentsResult.articles;
  const guardianResult = await fetchGuardianArticles(category);
  guardianArticles = guardianResult.articles;
  const gnewsResult = await fetchGnewsArticles(category);
  gnewsArticles = gnewsResult.articles;

  const currentMappedArticles = currentArticles.map(mapCurrentArticle);
  const mergedArticles = [
    ...currentMappedArticles,
    ...nytArticles,
    ...currentsArticles,
    ...guardianArticles,
    ...gnewsArticles,
  ];
  const categoryFilteredArticles = normalizedRequestedCategory
    ? mergedArticles.filter(
        (article) =>
          article.category === normalizedRequestedCategory &&
          isArticleValidForCategory(article, normalizedRequestedCategory)
      )
    : mergedArticles;
  const mappedArticles = dedupeArticles(categoryFilteredArticles);
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
