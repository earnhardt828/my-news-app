import { looksLikeLowQualityImageUrl } from "../../../lib/article-images";

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
  enclosure?: {
    url?: string | null;
  } | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  publishedAt?: string | null;
  pubDate?: string | null;
  source?: {
    name?: string | null;
  } | null;
  source_name?: string | null;
  source_id?: string | null;
  category?: string[] | string | null;
};

type NormalizedArticle = {
  id: number;
  title: string;
  description: string | null;
  content: string | null;
  source: string;
  sourceName: string;
  url: string | null;
  image: string | null;
  imageUrl: string | null;
  urlToImage: string | null;
  mediaContent: string | null;
  enclosureUrl: string | null;
  ogImage: string | null;
  twitterImage: string | null;
  thumbnail: string | null;
  category: string;
  publishedAt: string | null;
  time: string;
  likes: number;
  comments: null[];
};

type NewsMode = "trending" | "latest" | "myfeed" | "search" | "compare" | "local";

type ProviderFetchParams = {
  mode: NewsMode;
  query: string;
  location: string;
  categories: string[];
  page: number;
  pageSize: number;
};

type ProviderResponse = {
  articles: NormalizedArticle[];
  hasMore: boolean;
};

type CachedResponse = {
  expiresAt: number;
  payload: NewsRouteResponse;
};

type EnrichedImageCacheEntry = {
  expiresAt: number;
  imageUrl: string | null;
};

type NewsRouteResponse = {
  articles: NormalizedArticle[];
  nextPage: number | null;
  hasMore: boolean;
  page: number;
  pageSize: number;
};

type NewsDataApiResponse = {
  nextPage?: string | null;
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

type GNewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    content?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: {
      name?: string | null;
    } | null;
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
    source?: {
      name?: string | null;
    } | null;
  }>;
};

type RssFeedConfig = {
  url: string;
  source: string;
  category: string;
  tags: string[];
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 30;
const MAX_COMPARE_PAGE_SIZE = 150;
const IMAGE_ENRICHMENT_CACHE_TTL_MS = 45 * 60 * 1000;
const IMAGE_ENRICHMENT_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 7 * 60 * 1000;

const NEWS_API_KEY = process.env.NEWS_API_KEY ?? process.env.NEXT_PUBLIC_NEWS_API_KEY ?? "";
const GNEWS_API_KEY = process.env.GNEWS_API_KEY ?? "";
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? "";

function logProviderSkip(providerName: string, reason: string) {
  console.warn(`[api/news] Skipping ${providerName}: ${reason}`);
}

const responseCache = new Map<string, CachedResponse>();
const enrichedImageCache = new Map<string, EnrichedImageCacheEntry>();
const newsDataTokenCache = new Map<string, string[]>();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const CATEGORY_QUERY_MAP: Record<string, string> = {
  "Breaking News": "breaking news OR developing story OR live updates",
  Politics: "politics OR congress OR election OR white house",
  World: "world news OR international OR global conflict",
  Business: "business OR economy OR corporate",
  Tech: "technology OR AI OR software OR startup",
  Sports: "sports OR game OR season OR league",
  Health: "health OR medicine OR hospital OR disease",
  Science: "science OR research OR climate OR nasa",
  Entertainment: "entertainment OR celebrity OR streaming OR movies",
  Celebrity: "celebrity OR hollywood OR tmz OR people magazine OR variety OR e! news",
  Finance: "finance OR markets OR stocks OR federal reserve",
  Crime: "crime OR police OR court",
  Weather: "weather OR storm OR forecast",
  Education: "education OR schools OR college",
  "Local News": "\"local news\" OR city OR community",
};

const RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://rss.cnn.com/rss/cnn_topstories.rss",
    source: "CNN",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://feeds.reuters.com/reuters/topNews",
    source: "Reuters",
    category: "Breaking News",
    tags: ["breaking", "markets", "world"],
  },
  {
    url: "https://feeds.apnews.com/apnews/topnews",
    source: "AP News",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    source: "BBC News",
    category: "World",
    tags: ["world", "international", "conflict"],
  },
  {
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    source: "BBC News",
    category: "Business",
    tags: ["business", "economy", "markets"],
  },
  {
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    source: "BBC News",
    category: "Tech",
    tags: ["technology", "ai", "startup"],
  },
  {
    url: "https://feeds.npr.org/1001/rss.xml",
    source: "NPR",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://moxie.foxnews.com/google-publisher/latest.xml",
    source: "Fox News",
    category: "Breaking News",
    tags: ["breaking", "politics", "us"],
  },
  {
    url: "https://feeds.nbcnews.com/nbcnews/public/news",
    source: "NBC News",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://www.cbsnews.com/latest/rss/main",
    source: "CBS News",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://abcnews.go.com/abcnews/topstories",
    source: "ABC News",
    category: "Breaking News",
    tags: ["breaking", "politics", "world"],
  },
  {
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    source: "CNBC",
    category: "Finance",
    tags: ["finance", "markets", "business"],
  },
  {
    url: "https://feeds.bloomberg.com/markets/news.rss",
    source: "Bloomberg",
    category: "Finance",
    tags: ["finance", "markets", "business"],
  },
  {
    url: "https://www.politico.com/rss/politicopicks.xml",
    source: "Politico",
    category: "Politics",
    tags: ["politics", "elections", "policy"],
  },
  {
    url: "https://thehill.com/feed/",
    source: "The Hill",
    category: "Politics",
    tags: ["politics", "congress", "policy"],
  },
  {
    url: "https://www.theguardian.com/us-news/rss",
    source: "The Guardian",
    category: "World",
    tags: ["world", "politics", "us"],
  },
  {
    url: "https://api.axios.com/feed/",
    source: "Axios",
    category: "Politics",
    tags: ["politics", "business", "tech"],
  },
  {
    url: "https://www.espn.com/espn/rss/news",
    source: "ESPN",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.tmz.com/rss.xml",
    source: "TMZ",
    category: "Entertainment",
    tags: ["entertainment", "celebrity", "culture"],
  },
  {
    url: "https://www.newsmax.com/rss/Newsfront/16/",
    source: "Newsmax",
    category: "Politics",
    tags: ["politics", "us", "breaking"],
  },
  {
    url: "https://www.charlotteobserver.com/latest-news/?outputType=xml",
    source: "Charlotte Observer",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.wsoctv.com/arc/outboundfeeds/rss/",
    source: "WSOC-TV",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.wbtv.com/rss/",
    source: "WBTV",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.wcnc.com/feeds/syndication/rss/news/local",
    source: "WCNC",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.qcnews.com/feed/",
    source: "Queen City News",
    category: "Local News",
    tags: ["charlotte", "queen city", "north carolina", "local"],
  },
  {
    url: "https://www.wfae.org/rss.xml",
    source: "WFAE",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://charlotte.axios.com/feed/",
    source: "Axios Charlotte",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.wccbcharlotte.com/feed/",
    source: "WCCB Charlotte",
    category: "Local News",
    tags: ["charlotte", "north carolina", "local"],
  },
  {
    url: "https://www.chicagotribune.com/feed/",
    source: "Chicago Tribune",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://wgntv.com/feed/",
    source: "WGN Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://abc7chicago.com/feed/",
    source: "ABC7 Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://www.nbcchicago.com/feed/",
    source: "NBC Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://www.cbsnews.com/chicago/latest/rss/main",
    source: "CBS Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://www.fox32chicago.com/rss",
    source: "Fox 32 Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://blockclubchicago.org/feed/",
    source: "Block Club Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
  {
    url: "https://www.wbez.org/rss.xml",
    source: "WBEZ Chicago",
    category: "Local News",
    tags: ["chicago", "illinois", "local"],
  },
];

const CHARLOTTE_LOCAL_SOURCES = [
  "charlotte observer",
  "wsoc-tv",
  "wsoc charlotte",
  "wbtv",
  "wcnc",
  "queen city news",
  "wfae",
  "axios charlotte",
  "wccb charlotte",
] as const;

const CHICAGO_LOCAL_SOURCES = [
  "chicago tribune",
  "wgn chicago",
  "wgn-tv",
  "abc7 chicago",
  "nbc chicago",
  "cbs chicago",
  "fox 32 chicago",
  "block club chicago",
  "wbez chicago",
] as const;

const LOCAL_CITY_CONFIGS = {
  "Charlotte, NC": {
    sources: CHARLOTTE_LOCAL_SOURCES,
    signals: ["charlotte", "mecklenburg", "queen city", "north carolina", "gastonia", "concord"],
  },
  "Chicago, IL": {
    sources: CHICAGO_LOCAL_SOURCES,
    signals: ["chicago", "illinois", "cook county", "evanston", "oak park", "naperville"],
  },
  "Los Angeles, CA": {
    sources: ["la times", "ktla", "abc7 los angeles", "nbc los angeles", "cbs los angeles", "laist"],
    signals: ["los angeles", "la county", "hollywood", "pasadena", "santa monica", "burbank"],
  },
  "New York, NY": {
    sources: ["ny1", "gothamist", "new york daily news", "cbs new york", "nbc new york", "abc7ny"],
    signals: ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island"],
  },
  "Atlanta, GA": {
    sources: ["ajc", "wsb-tv", "fox 5 atlanta", "11alive", "atlanta news first"],
    signals: ["atlanta", "georgia", "fulton county", "buckhead", "decatur"],
  },
  "Houston, TX": {
    sources: ["houston chronicle", "khou", "abc13 houston", "fox 26 houston", "kprc"],
    signals: ["houston", "texas", "harris county", "sugar land"],
  },
  "Miami, FL": {
    sources: ["miami herald", "wsvn", "nbc 6 south florida", "cbs miami", "local 10"],
    signals: ["miami", "florida", "miami-dade", "south florida", "fort lauderdale"],
  },
  "Cincinnati, OH": {
    sources: ["cincinnati enquirer", "wcpo", "wlwt", "fox19"],
    signals: ["cincinnati", "ohio", "hamilton county", "northern kentucky"],
  },
  "Detroit, MI": {
    sources: ["detroit free press", "detroit news", "wxyz", "clickondetroit", "fox 2 detroit"],
    signals: ["detroit", "michigan", "wayne county", "dearborn"],
  },
  "Minneapolis, MN": {
    sources: ["star tribune", "kare 11", "wcco", "fox 9", "mpr news"],
    signals: ["minneapolis", "minnesota", "saint paul", "st paul", "twin cities"],
  },
  "Phoenix, AZ": {
    sources: ["arizona republic", "azfamily", "abc15 arizona", "fox 10 phoenix", "12news"],
    signals: ["phoenix", "arizona", "mesa", "tempe", "scottsdale"],
  },
  "San Francisco, CA": {
    sources: ["sf chronicle", "kqed", "abc7 bay area", "nbc bay area", "cbs news bay area"],
    signals: ["san francisco", "bay area", "oakland", "berkeley", "marin"],
  },
  "Philadelphia, PA": {
    sources: ["philadelphia inquirer", "6abc", "nbc10 philadelphia", "cbs philadelphia", "whyy"],
    signals: ["philadelphia", "philly", "pennsylvania", "camden", "delco"],
  },
} as const;

function isQualifiedLocalArticle(article: NormalizedArticle, location: string) {
  const normalizedLocation = location.trim().toLowerCase();
  const localCityConfig = getLocalCityConfig(normalizedLocation);

  if (!localCityConfig) {
    return false;
  }

  const [, config] = localCityConfig;
  const sourceName = article.source.trim().toLowerCase();
  const articleText = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${
    article.source
  } ${article.category}`.toLowerCase();
  const hasLocalSourceMatch = config.sources.some((source) => sourceName.includes(source));
  const hasLocalSignalMatch = config.signals.some((signal) => articleText.includes(signal));
  const localScore = getLocalMatchScore(article, location);

  if (hasLocalSourceMatch) {
    return true;
  }

  if (hasLocalSignalMatch && localScore >= 45) {
    return true;
  }

  return false;
}

const FALLBACK_ARTICLE_SEEDS = [
  {
    title: "Congress returns with a packed agenda on budget, border, and aid talks",
    source: "Associated Press",
    category: "Politics",
    description:
      "Lawmakers head back to Washington facing another week of negotiations on domestic priorities and international funding.",
  },
  {
    title: "Wall Street watches bond yields, oil prices, and earnings for fresh signals",
    source: "Reuters",
    category: "Finance",
    description:
      "Investors are tracking rates, commodities, and corporate outlooks as markets look for direction.",
  },
  {
    title: "Tech companies push new AI features while regulators weigh guardrails",
    source: "Bloomberg",
    category: "Tech",
    description:
      "The latest product rollouts arrive alongside policy questions about safety, transparency, and competition.",
  },
  {
    title: "Global leaders renew ceasefire pressure as humanitarian corridors remain fragile",
    source: "Al Jazeera",
    category: "World",
    description:
      "Diplomatic efforts continue as aid groups warn that access and supply routes remain uncertain.",
  },
  {
    title: "Major league contenders reshuffle rotations as the season intensifies",
    source: "ESPN",
    category: "Sports",
    description:
      "Teams are adjusting lineups and workloads as injuries and standings start to shape strategy.",
  },
];

function hashArticleId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
}

function deterministicPopularitySeed(input: string) {
  const seed = hashArticleId(input);
  const likes = 18 + (seed % 83);
  const commentCount = (Math.floor(seed / 13) % 21) + 2;
  return { likes, commentCount };
}

function normalizeUrl(url: string | null | undefined) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
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
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTitleFingerprint(title: string) {
  return normalizeTitle(title)
    .split(" ")
    .filter((word) => word.length > 2)
    .slice(0, 12)
    .join(" ");
}

function decodeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string | null | undefined) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProviderImage(raw: ProviderArticle) {
  const mediaUrl =
    raw.mediaContent ||
    (typeof raw.media === "string"
      ? raw.media
      : raw.media && typeof raw.media === "object"
        ? raw.media.url ?? null
        : null);
  const enclosureUrl =
    raw.enclosureUrl ||
    (raw.enclosure && typeof raw.enclosure === "object" ? raw.enclosure.url ?? null : null);

  return {
    urlToImage: raw.urlToImage ?? null,
    imageUrl: raw.imageUrl || raw.image_url || null,
    image: raw.image ?? null,
    mediaContent: mediaUrl,
    enclosureUrl,
    ogImage: raw.ogImage ?? null,
    twitterImage: raw.twitterImage ?? null,
    thumbnail: raw.thumbnail ?? null,
  };
}

function getPublishedIso(
  value: string | null | undefined,
  fallbackOffsetHours = 0
) {
  if (!value) {
    return new Date(Date.now() - fallbackOffsetHours * 60 * 60 * 1000).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(Date.now() - fallbackOffsetHours * 60 * 60 * 1000).toISOString()
    : parsed.toISOString();
}

function buildNormalizedArticle(
  raw: ProviderArticle,
  fallback: {
    source: string;
    category: string;
    uniqueSeed: string;
    fallbackPublishedOffsetHours?: number;
  }
): NormalizedArticle | null {
  const title = raw.title?.trim();
  const normalizedUrl = normalizeUrl(raw.url);

  if (!title || !normalizedUrl) {
    return null;
  }

  const sourceName =
    raw.source?.name?.trim() ||
    raw.source_name?.trim() ||
    raw.source_id?.trim() ||
    fallback.source;
  const category =
    Array.isArray(raw.category) && raw.category[0]
      ? raw.category[0]
      : typeof raw.category === "string" && raw.category.trim()
        ? raw.category.trim()
        : fallback.category;
  const providerImage = getProviderImage(raw);
  const publishedAt = getPublishedIso(
    raw.publishedAt ?? raw.pubDate,
    fallback.fallbackPublishedOffsetHours ?? 0
  );
  const popularity = deterministicPopularitySeed(`${normalizedUrl}-${sourceName}-${title}`);

  return {
    id: hashArticleId(`${normalizedUrl}-${fallback.uniqueSeed}`),
    title,
    description: raw.description?.trim() ?? null,
    content: raw.content?.trim() ?? raw.description?.trim() ?? null,
    source: sourceName,
    sourceName,
    url: normalizedUrl,
    image: providerImage.image,
    imageUrl: providerImage.imageUrl,
    urlToImage: providerImage.urlToImage,
    mediaContent: providerImage.mediaContent,
    enclosureUrl: providerImage.enclosureUrl,
    ogImage: providerImage.ogImage,
    twitterImage: providerImage.twitterImage,
    thumbnail: providerImage.thumbnail,
    category,
    publishedAt,
    time: "Recent",
    likes: popularity.likes,
    comments: new Array(popularity.commentCount).fill(null),
  };
}

function getModeCategories(mode: NewsMode, categories: string[]) {
  if (mode === "myfeed" && categories.length > 0) {
    return categories.slice(0, 5);
  }

  if (categories.length > 0) {
    return categories.slice(0, 5);
  }

  return ["Breaking News", "Politics", "World", "Business", "Tech", "Sports"];
}

function getCategoryQuery(category: string) {
  return CATEGORY_QUERY_MAP[category] ?? category;
}

function getEffectiveQuery(params: Pick<ProviderFetchParams, "mode" | "query" | "location">) {
  if (params.mode === "local") {
    return params.location.trim() || params.query.trim();
  }

  return params.query.trim();
}

function getMatchScore(article: NormalizedArticle, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const haystacks = [
    article.title.toLowerCase(),
    article.description?.toLowerCase() ?? "",
    article.content?.toLowerCase() ?? "",
    article.source.toLowerCase(),
    article.category.toLowerCase(),
  ];

  let score = 0;

  if (haystacks[0].includes(normalizedQuery)) score += 10;
  if (haystacks[1].includes(normalizedQuery)) score += 5;
  if (haystacks[2].includes(normalizedQuery)) score += 3;
  if (haystacks[3].includes(normalizedQuery)) score += 2;
  if (haystacks[4].includes(normalizedQuery)) score += 1;

  normalizedQuery
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .forEach((token) => {
      if (haystacks[0].includes(token)) score += 4;
      if (haystacks[1].includes(token)) score += 2;
      if (haystacks[2].includes(token)) score += 1;
    });

  return score;
}

function isCharlotteQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  return /(charlotte|mecklenburg|queen city|matthews|huntersville|gastonia|concord|rock hill|fort mill)/.test(
    normalized
  );
}

function isChicagoQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  return /(chicago|cook county|evanston|oak park|naperville|aurora|joliet|schaumburg)/.test(
    normalized
  );
}

function getLocalCityConfig(query: string) {
  const normalized = query.trim().toLowerCase();

  return (
    Object.entries(LOCAL_CITY_CONFIGS).find(([, config]) =>
      config.signals.some((signal) => normalized.includes(signal))
    ) ?? null
  );
}

function getLocalMatchScore(article: NormalizedArticle, location: string) {
  const normalizedLocation = location.trim().toLowerCase();
  const articleText = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${
    article.source
  } ${article.category}`.toLowerCase();
  const sourceName = article.source.trim().toLowerCase();
  const terms = normalizedLocation
    .split(/[^a-z0-9]+/)
    .filter(
      (term) =>
        term.length > 2 &&
        !["local", "news", "north", "south", "carolina", "regional", "united", "states"].includes(
          term
        )
    );

  let score = 0;
  const localCityConfig = getLocalCityConfig(normalizedLocation);

  if (localCityConfig) {
    const [, config] = localCityConfig;

    if (config.sources.some((source) => sourceName.includes(source))) {
      score += 120;
    }

    if (config.signals.some((signal) => articleText.includes(signal))) {
      score += 70;
    }

    if (
      /(fox news|cnn|reuters|associated press|ap news|nbc news|cbs news|abc news|newsmax|bbc news)/.test(
        sourceName
      ) &&
      !config.signals.some((signal) => articleText.includes(signal))
    ) {
      score -= 55;
    }
  }

  if (isCharlotteQuery(normalizedLocation)) {
    if (/charlotte|mecklenburg|queen city|matthews|huntersville|gastonia|concord|rock hill|fort mill/.test(articleText)) {
      score += 20;
    }
  }

  if (isChicagoQuery(normalizedLocation)) {
    if (/chicago|illinois|cook county|evanston|oak park|naperville|aurora|joliet|schaumburg/.test(articleText)) {
      score += 20;
    }
  }

  terms.forEach((term) => {
    if (articleText.includes(term)) {
      score += 18;
    }
    if (sourceName.includes(term)) {
      score += 22;
    }
  });

  if (article.category.toLowerCase() === "local news") {
    score += 12;
  }

  return score;
}

function diversifyArticles<T extends { source: string; category: string }>(articles: T[]) {
  const remaining = [...articles];
  const diversified: T[] = [];
  let lastSource = "";
  let lastCategory = "";

  while (remaining.length > 0) {
    let selectedIndex = remaining.findIndex((article) => {
      const sourceKey = article.source.trim().toLowerCase();
      const categoryKey = article.category.trim().toLowerCase();

      return sourceKey !== lastSource && categoryKey !== lastCategory;
    });

    if (selectedIndex === -1) {
      selectedIndex = remaining.findIndex(
        (article) => article.source.trim().toLowerCase() !== lastSource
      );
    }

    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const [nextArticle] = remaining.splice(selectedIndex, 1);
    diversified.push(nextArticle);
    lastSource = nextArticle.source.trim().toLowerCase();
    lastCategory = nextArticle.category.trim().toLowerCase();
  }

  return diversified;
}

function getPublishedTime(article: { publishedAt: string | null }) {
  if (!article.publishedAt) {
    return 0;
  }

  const timestamp = new Date(article.publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getLaunchRecencyScore(article: { publishedAt: string | null }) {
  const publishedTime = getPublishedTime(article);

  if (!publishedTime) {
    return 0.1;
  }

  const ageHours = Math.max(0, (Date.now() - publishedTime) / 3_600_000);

  if (ageHours <= 6) {
    return 1;
  }

  if (ageHours <= 24) {
    return 0.94;
  }

  if (ageHours <= 72) {
    return 0.8;
  }

  if (ageHours <= 168) {
    return 0.56;
  }

  if (ageHours <= 336) {
    return 0.32;
  }

  return 0.14;
}

function getProviderOrderScore(index: number, total: number) {
  if (total <= 1) {
    return 1;
  }

  return 1 - index / Math.max(1, total - 1);
}

function balanceTrendingArticles<T extends { source: string; category: string }>(
  articles: T[],
  windowSize = 25
) {
  const remaining = [...articles];
  const balanced: T[] = [];
  const sourceCounts = new Map<string, number>();
  let lastSource = "";
  let lastCategory = "";

  while (balanced.length < windowSize && remaining.length > 0) {
    let selectedIndex = remaining.findIndex((article, index) => {
      const sourceKey = article.source.trim().toLowerCase();
      const categoryKey = article.category.trim().toLowerCase();
      const sourceCount = sourceCounts.get(sourceKey) ?? 0;
      const otherSourceAvailable = remaining.some((candidate, candidateIndex) => {
        if (candidateIndex === index) {
          return false;
        }

        const candidateSourceKey = candidate.source.trim().toLowerCase();
        return candidateSourceKey !== sourceKey && (sourceCounts.get(candidateSourceKey) ?? 0) < 2;
      });

      if (sourceCount >= 2 && otherSourceAvailable) {
        return false;
      }

      if (sourceKey === lastSource) {
        const alternativeSourceAvailable = remaining.some((candidate, candidateIndex) => {
          if (candidateIndex === index) {
            return false;
          }

          const candidateSourceKey = candidate.source.trim().toLowerCase();
          return candidateSourceKey !== sourceKey && (sourceCounts.get(candidateSourceKey) ?? 0) < 2;
        });

        if (alternativeSourceAvailable) {
          return false;
        }
      }

      if (categoryKey === lastCategory) {
        const alternativeCategoryAvailable = remaining.some((candidate, candidateIndex) => {
          if (candidateIndex === index) {
            return false;
          }

          return candidate.category.trim().toLowerCase() !== categoryKey;
        });

        if (alternativeCategoryAvailable) {
          return false;
        }
      }

      return true;
    });

    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const [nextArticle] = remaining.splice(selectedIndex, 1);
    balanced.push(nextArticle);
    lastSource = nextArticle.source.trim().toLowerCase();
    lastCategory = nextArticle.category.trim().toLowerCase();
    sourceCounts.set(lastSource, (sourceCounts.get(lastSource) ?? 0) + 1);
  }

  return [...balanced, ...remaining];
}

function sortTrendingForLaunch(articles: NormalizedArticle[]) {
  const sourceFrequency = new Map<string, number>();
  const categoryFrequency = new Map<string, number>();

  articles.forEach((article) => {
    const sourceKey = article.source.trim().toLowerCase();
    const categoryKey = article.category.trim().toLowerCase();
    sourceFrequency.set(sourceKey, (sourceFrequency.get(sourceKey) ?? 0) + 1);
    categoryFrequency.set(categoryKey, (categoryFrequency.get(categoryKey) ?? 0) + 1);
  });

  const scored = [...articles]
    .map((article, index) => {
      const sourceKey = article.source.trim().toLowerCase();
      const categoryKey = article.category.trim().toLowerCase();
      const sourceCount = sourceFrequency.get(sourceKey) ?? 1;
      const categoryCount = categoryFrequency.get(categoryKey) ?? 1;
      const engagementScore = Math.min(
        1,
        (article.likes + article.comments.length * 2) / 18
      );
      const launchScore =
        getLaunchRecencyScore(article) * 0.46 +
        getProviderOrderScore(index, articles.length) * 0.31 +
        (1 / sourceCount) * 0.15 +
        (1 / categoryCount) * 0.06 +
        engagementScore * 0.02 -
        Math.max(0, sourceCount - 2) * 0.015;

      return {
        article,
        launchScore,
        publishedTime: getPublishedTime(article),
      };
    })
    .sort((left, right) => {
      if (right.launchScore !== left.launchScore) {
        return right.launchScore - left.launchScore;
      }

      return right.publishedTime - left.publishedTime;
    })
    .map(({ article }) => article);

  return balanceTrendingArticles(scored);
}

function dedupeArticles(articles: NormalizedArticle[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  return articles.filter((article) => {
    const normalizedUrl = normalizeUrl(article.url);
    const titleFingerprint = buildTitleFingerprint(article.title);

    if (normalizedUrl && seenUrls.has(normalizedUrl)) {
      return false;
    }

    if (titleFingerprint && seenTitles.has(titleFingerprint)) {
      return false;
    }

    if (normalizedUrl) {
      seenUrls.add(normalizedUrl);
    }

    if (titleFingerprint) {
      seenTitles.add(titleFingerprint);
    }

    return true;
  });
}

function isFallbackArticle(article: NormalizedArticle) {
  return article.url?.includes("graffiti.app/fallback") ?? false;
}

function resolveArticleImageUrl(candidate: string | null | undefined, articleUrl: string) {
  const trimmed = candidate?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed, articleUrl).toString();
  } catch {
    return null;
  }
}

async function enrichArticleImageFromDocument(article: NormalizedArticle) {
  const articleUrl = article.url?.trim();

  if (!articleUrl) {
    return article;
  }

  const cached = enrichedImageCache.get(articleUrl);

  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.imageUrl) {
      return article;
    }

    console.log("ENRICHED OG IMAGE", { title: article.title, imageUrl: cached.imageUrl });
    return {
      ...article,
      ogImage: cached.imageUrl,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, IMAGE_ENRICHMENT_TIMEOUT_MS);

  try {
    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; GraffitiNewsBot/1.0; +https://graffiti.news)",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`HTML fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    const ogImage =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ?? null;
    const twitterImage =
      html.match(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ?? null;
    const imageSrcLink =
      html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    const resolvedImageUrl =
      resolveArticleImageUrl(ogImage, articleUrl) ||
      resolveArticleImageUrl(twitterImage, articleUrl) ||
      resolveArticleImageUrl(imageSrcLink, articleUrl);

    if (!resolvedImageUrl || looksLikeLowQualityImageUrl(resolvedImageUrl)) {
      enrichedImageCache.set(articleUrl, {
        expiresAt: Date.now() + IMAGE_ENRICHMENT_CACHE_TTL_MS,
        imageUrl: null,
      });
      return article;
    }

    enrichedImageCache.set(articleUrl, {
      expiresAt: Date.now() + IMAGE_ENRICHMENT_CACHE_TTL_MS,
      imageUrl: resolvedImageUrl,
    });
    console.log("ENRICHED OG IMAGE", {
      title: article.title,
      imageUrl: resolvedImageUrl,
    });

    return {
      ...article,
      ogImage: resolveArticleImageUrl(ogImage, articleUrl),
      twitterImage:
        resolveArticleImageUrl(twitterImage, articleUrl) ||
        resolveArticleImageUrl(imageSrcLink, articleUrl),
    };
  } catch (error) {
    console.log("IMAGE ENRICHMENT FAILED", {
      url: articleUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    enrichedImageCache.set(articleUrl, {
      expiresAt: Date.now() + IMAGE_ENRICHMENT_CACHE_TTL_MS,
      imageUrl: null,
    });
    return article;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enrichTrendingArticleImages(articles: NormalizedArticle[]) {
  const candidates = articles.slice(0, 25).filter((article) => {
    return !(
      article.urlToImage ||
      article.imageUrl ||
      article.image ||
      article.mediaContent ||
      article.enclosureUrl
    );
  });

  if (candidates.length === 0) {
    return articles;
  }

  const enrichmentResults = await Promise.allSettled(
    candidates.map((article) => enrichArticleImageFromDocument(article))
  );
  const enrichedById = new Map<number, NormalizedArticle>();

  enrichmentResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      enrichedById.set(candidates[index].id, result.value);
      return;
    }

    console.log("IMAGE ENRICHMENT FAILED", {
      url: candidates[index].url,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  return articles.map((article) => enrichedById.get(article.id) ?? article);
}

function sortArticlesForMode(
  articles: NormalizedArticle[],
  params: Pick<ProviderFetchParams, "mode" | "query" | "location">
) {
  if (params.mode === "search" || params.mode === "compare") {
    return [...articles].sort((left, right) => {
      const scoreDiff = getMatchScore(right, params.query) - getMatchScore(left, params.query);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  if (params.mode === "local") {
    return [...articles].sort((left, right) => {
      const scoreDiff =
        getLocalMatchScore(right, params.location || params.query) -
        getLocalMatchScore(left, params.location || params.query);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  if (params.mode === "latest") {
    return [...articles].sort((left, right) => {
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  if (params.mode === "myfeed") {
    return diversifyArticles(
      [...articles].sort((left, right) => getPublishedTime(right) - getPublishedTime(left))
    );
  }

  return sortTrendingForLaunch(articles);
}

function buildFallbackArticles(params: ProviderFetchParams): ProviderResponse {
  const repeated = Array.from({ length: 5 }, (_, cycleIndex) =>
    FALLBACK_ARTICLE_SEEDS.map((seed, seedIndex) => {
      const articleKey = `${seed.title}-${seed.source}-${cycleIndex}-${seedIndex}`;
      return buildNormalizedArticle(
        {
          title: cycleIndex === 0 ? seed.title : `${seed.title} Update ${cycleIndex + 1}`,
          description: seed.description,
          content: seed.description,
          url: `https://graffiti.app/fallback/${hashArticleId(articleKey)}`,
        },
        {
          source: seed.source,
          category: seed.category,
          uniqueSeed: articleKey,
          fallbackPublishedOffsetHours: cycleIndex * 5 + seedIndex,
        }
      );
    }).filter(Boolean) as NormalizedArticle[]
  ).flat();

  const start = (params.page - 1) * params.pageSize;
  const sliced = repeated.slice(start, start + params.pageSize);

  return {
    articles: sliced,
    hasMore: repeated.length > start + params.pageSize,
  };
}

function buildNewsApiUrls(params: ProviderFetchParams) {
  const categories = getModeCategories(params.mode, params.categories);
  const requests: Array<{ url: string; category: string }> = [];

  const effectiveQuery = getEffectiveQuery(params);

  if ((params.mode === "search" || params.mode === "compare" || params.mode === "local") && effectiveQuery) {
    const encodedQuery = encodeURIComponent(effectiveQuery);
    const exactQuery = encodeURIComponent(`"${effectiveQuery}"`);
    requests.push(
      {
        url: `https://newsapi.org/v2/everything?q=${exactQuery}&language=en&sortBy=publishedAt&page=${params.page}&pageSize=${Math.max(
          params.mode === "compare" ? 20 : params.mode === "local" ? 14 : 8,
          Math.ceil(params.pageSize / 2)
        )}`,
        category: "Search",
      },
      {
        url: `https://newsapi.org/v2/everything?q=${encodedQuery}&language=en&sortBy=publishedAt&page=${params.page}&pageSize=${Math.max(
          params.mode === "compare" ? 30 : params.mode === "local" ? 20 : 10,
          params.pageSize
        )}`,
        category: "Search",
      }
    );
    return requests;
  }

  const perCategoryPageSize = Math.max(4, Math.ceil(params.pageSize / Math.max(categories.length, 1)));
  const categoryMap: Record<string, string> = {
    Business: "business",
    Entertainment: "entertainment",
    Health: "health",
    Science: "science",
    Sports: "sports",
    Tech: "technology",
  };

  categories.forEach((category) => {
    const topHeadlineCategory = categoryMap[category];

    if (topHeadlineCategory) {
      requests.push({
        url: `https://newsapi.org/v2/top-headlines?country=us&category=${topHeadlineCategory}&page=${params.page}&pageSize=${perCategoryPageSize}`,
        category,
      });
      return;
    }

    requests.push({
      url: `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        getCategoryQuery(category)
      )}&language=en&sortBy=publishedAt&page=${params.page}&pageSize=${perCategoryPageSize}`,
      category,
    });
  });

  return requests;
}

async function fetchNewsApiArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  if (!NEWS_API_KEY) {
    logProviderSkip("NewsAPI", "NEWS_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const requests = buildNewsApiUrls(params);
  let hasLoggedRawSample = false;

  const responses = await Promise.allSettled(
    requests.map(async ({ url, category }) => {
      const response = await fetch(url, {
        headers: {
          "X-Api-Key": NEWS_API_KEY,
        },
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`NewsAPI request failed for ${category} with status ${response.status}`);
      }

      const data = (await response.json()) as NewsApiResponse;
      const rawArticles = data.articles ?? [];

      if (!hasLoggedRawSample && rawArticles.length > 0) {
        console.log("RAW ARTICLE SAMPLE", rawArticles[0] ?? null);
        hasLoggedRawSample = true;
      }

      return rawArticles
        .map((article, index) =>
          buildNormalizedArticle(article, {
            source: article.source?.name?.trim() || "NewsAPI",
            category,
            uniqueSeed: `newsapi-${category}-${params.page}-${index}`,
            fallbackPublishedOffsetHours: index,
          })
        )
        .filter(Boolean) as NormalizedArticle[];
    })
  );

  const normalizedArticles = responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("NewsAPI provider error:", result.reason);
    return [];
  });

  console.log("NEWSAPI REQUEST COUNT", requests.length);
  console.log("NORMALIZED COUNT", normalizedArticles.length);
  console.log("NORMALIZED ARTICLE SAMPLE", normalizedArticles[0] ?? null);

  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function fetchGNewsArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  if (!GNEWS_API_KEY) {
    logProviderSkip("GNews", "GNEWS_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const requests: Array<{ url: string; category: string }> = [];

  const effectiveQuery = getEffectiveQuery(params);

  if ((params.mode === "search" || params.mode === "compare" || params.mode === "local") && effectiveQuery) {
    requests.push({
      url: `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        effectiveQuery
      )}&lang=en&country=us&max=${Math.min(
        params.mode === "compare" ? Math.max(params.pageSize, 50) : params.pageSize,
        100
      )}&page=${params.page}&expand=content&token=${GNEWS_API_KEY}`,
      category: "Search",
    });
  } else {
    const perCategoryPageSize = Math.max(4, Math.ceil(params.pageSize / Math.max(categories.length, 1)));
    categories.forEach((category) => {
      requests.push({
        url: `https://gnews.io/api/v4/top-headlines?category=${encodeURIComponent(
          category === "Breaking News" ? "general" : category.toLowerCase()
        )}&lang=en&country=us&max=${perCategoryPageSize}&page=${params.page}&token=${GNEWS_API_KEY}`,
        category,
      });
    });
  }

  const responses = await Promise.allSettled(
    requests.map(async ({ url, category }) => {
      const response = await fetch(url, {
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`GNews request failed for ${category} with status ${response.status}`);
      }

      const data = (await response.json()) as GNewsApiResponse;

      return (data.articles ?? [])
        .map((article, index) =>
          buildNormalizedArticle(article, {
            source: article.source?.name?.trim() || "GNews",
            category,
            uniqueSeed: `gnews-${category}-${params.page}-${index}`,
            fallbackPublishedOffsetHours: index,
          })
        )
        .filter(Boolean) as NormalizedArticle[];
    })
  );

  const normalizedArticles = responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("GNews provider error:", result.reason);
    return [];
  });

  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function resolveNewsDataToken(baseKey: string, page: number, url: URL) {
  if (page <= 1) {
    return "";
  }

  const cachedTokens = newsDataTokenCache.get(baseKey) ?? [""];

  if (cachedTokens[page - 1] !== undefined) {
    return cachedTokens[page - 1] ?? "";
  }

  let nextToken = cachedTokens[cachedTokens.length - 1] ?? "";

  for (let currentPage = cachedTokens.length; currentPage < page; currentPage += 1) {
    if (!nextToken) {
      return "";
    }

    const probeUrl = new URL(url.toString());
    probeUrl.searchParams.set("page", nextToken);
    const response = await fetch(probeUrl.toString(), {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as NewsDataApiResponse;
    cachedTokens[currentPage] = nextToken;
    nextToken = data.nextPage ?? "";
  }

  newsDataTokenCache.set(baseKey, cachedTokens);
  return cachedTokens[page - 1] ?? "";
}

async function fetchNewsDataArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  if (!NEWSDATA_API_KEY) {
    logProviderSkip("NewsData.io", "NEWSDATA_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const baseUrl = new URL("https://newsdata.io/api/1/latest");
  baseUrl.searchParams.set("apikey", NEWSDATA_API_KEY);
  baseUrl.searchParams.set("language", "en");
  baseUrl.searchParams.set("country", "us");

  const effectiveQuery = getEffectiveQuery(params);

  if ((params.mode === "search" || params.mode === "compare" || params.mode === "local") && effectiveQuery) {
    baseUrl.searchParams.set("q", effectiveQuery);
  } else if (categories.length > 0) {
    baseUrl.searchParams.set("q", getCategoryQuery(categories[0]));
    baseUrl.searchParams.set("category", categories[0].toLowerCase().replace(/\s+/g, ","));
  }

  const tokenCacheKey = JSON.stringify({
    mode: params.mode,
    query: params.query,
    location: params.location,
    categories,
  });
  const pageToken = await resolveNewsDataToken(tokenCacheKey, params.page, baseUrl);

  if (params.page > 1 && !pageToken) {
    return { articles: [], hasMore: false };
  }

  if (pageToken) {
    baseUrl.searchParams.set("page", pageToken);
  }

  const response = await fetch(baseUrl.toString(), {
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    console.error("NewsData.io provider error:", response.status, response.statusText);
    return { articles: [], hasMore: false };
  }

  const data = (await response.json()) as NewsDataApiResponse;
  const cachedTokens = newsDataTokenCache.get(tokenCacheKey) ?? [""];
  cachedTokens[params.page] = data.nextPage ?? "";
  newsDataTokenCache.set(tokenCacheKey, cachedTokens);

  const normalizedArticles = (data.results ?? [])
    .map((article, index) =>
      buildNormalizedArticle(
        {
          title: article.title,
          description: article.description,
          content: article.content,
          url: article.link,
          image_url: article.image_url,
          pubDate: article.pubDate,
          source_name: article.source_name,
          source_id: article.source_id,
          category: article.category,
        },
        {
          source: article.source_name?.trim() || article.source_id?.trim() || "NewsData.io",
          category: Array.isArray(article.category) ? article.category[0] ?? "News" : "News",
          uniqueSeed: `newsdata-${params.page}-${index}`,
          fallbackPublishedOffsetHours: index,
        }
      )
    )
    .filter(Boolean) as NormalizedArticle[];

  return {
    articles: normalizedArticles,
    hasMore: Boolean(data.nextPage),
  };
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
      const contentEncoded = extractXmlTag(block, "content:encoded");
      const ogImage =
        contentEncoded.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        description.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        null;
      const twitterImage =
        contentEncoded.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        description.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        null;

      return buildNormalizedArticle(
        {
          title: stripHtml(extractXmlTag(block, "title")),
          description: stripHtml(description),
          content: stripHtml(contentEncoded || description),
          url: extractXmlTag(block, "link"),
          publishedAt: extractXmlTag(block, "pubDate"),
          media: mediaUrl,
          enclosure: enclosureUrl ? { url: enclosureUrl } : null,
          thumbnail: mediaThumbnailUrl,
          imageUrl: descriptionImageUrl,
          ogImage,
          twitterImage,
          category: stripHtml(extractXmlTag(block, "category")) || fallbackFeed.category,
          source_name: fallbackFeed.source,
        },
        {
          source: fallbackFeed.source,
          category: fallbackFeed.category,
          uniqueSeed: `rss-${fallbackFeed.source}-${index}`,
          fallbackPublishedOffsetHours: index,
        }
      );
    })
    .filter(Boolean) as NormalizedArticle[];
}

async function fetchRssArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  const candidateFeeds =
    (params.mode === "search" || params.mode === "compare" || params.mode === "local") &&
    getEffectiveQuery(params)
      ? RSS_FEEDS
      : RSS_FEEDS.filter((feed) => {
          const modeCategories = getModeCategories(params.mode, params.categories);
          return modeCategories.includes(feed.category);
        });

  const feedsToFetch =
    params.mode === "local" &&
    getLocalCityConfig(params.location || params.query)
      ? RSS_FEEDS.filter(
          (feed) =>
            (getLocalCityConfig(params.location || params.query)?.[1].sources ?? []).some(
              (source) => feed.source.toLowerCase().includes(source)
            ) ||
            (getLocalCityConfig(params.location || params.query)?.[1].signals ?? []).some(
              (signal) =>
                feed.source.toLowerCase().includes(signal) ||
                feed.tags.some((tag) => tag.toLowerCase().includes(signal))
            )
        )
      : candidateFeeds.length > 0
      ? candidateFeeds
      : RSS_FEEDS;

  const responses = await Promise.allSettled(
    feedsToFetch
      .slice(
        0,
        params.mode === "compare"
          ? 10
          : params.mode === "trending"
          ? 12
          : params.mode === "local"
          ? 10
          : params.mode === "latest"
          ? 10
          : 8
      )
      .map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "User-Agent": "GraffitiNews/1.0 (+https://graffiti.news)",
        },
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`RSS request failed for ${feed.source} with status ${response.status}`);
      }

      const xml = await response.text();
      return parseRssItems(xml, feed);
    })
  );

  let articles = responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("RSS provider error:", result.reason);
    return [];
  });

  if ((params.mode === "search" || params.mode === "compare") && params.query.trim()) {
    articles = articles.filter((article) => getMatchScore(article, params.query) > 0);
  }

  if (params.mode === "local") {
    const locationQuery = params.location || params.query;
    articles = articles.filter((article) => isQualifiedLocalArticle(article, locationQuery));
  }

  articles.sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  const start = (params.page - 1) * params.pageSize;
  const sliced = articles.slice(start, start + params.pageSize);

  return {
    articles: sliced,
    hasMore: articles.length > start + params.pageSize,
  };
}

async function collectArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const cacheKey = JSON.stringify({
    mode: params.mode,
    query: params.query,
    location: params.location,
    categories: params.categories,
    page: params.page,
    pageSize: params.pageSize,
  });
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const providerFetchers = [
    { name: "NewsAPI", run: () => fetchNewsApiArticles(params) },
    { name: "GNews", run: () => fetchGNewsArticles(params) },
    { name: "NewsData.io", run: () => fetchNewsDataArticles(params) },
    { name: "RSS", run: () => fetchRssArticles(params) },
  ] as const;
  const providerResponses = await Promise.allSettled(
    providerFetchers.map((provider) => provider.run())
  );

  const providerDiagnostics = providerResponses.map((result, index) => {
    const providerName = providerFetchers[index].name;

    if (result.status === "fulfilled") {
      return {
        provider: providerName,
        ok: true,
        articleCount: result.value.articles.length,
        hasMore: result.value.hasMore,
      };
    }

    console.error("News provider pipeline error:", {
      provider: providerName,
      error: result.reason,
    });

    return {
      provider: providerName,
      ok: false,
      articleCount: 0,
      hasMore: false,
      error:
        result.reason instanceof Error
          ? {
              name: result.reason.name,
              message: result.reason.message,
            }
          : String(result.reason),
    };
  });

  console.log("[api/news] Provider diagnostics", {
    mode: params.mode,
    page: params.page,
    pageSize: params.pageSize,
    query: params.query,
    location: params.location,
    configuredProviders: {
      newsApi: Boolean(NEWS_API_KEY),
      gnews: Boolean(GNEWS_API_KEY),
      newsData: Boolean(NEWSDATA_API_KEY),
      rss: true,
    },
    providers: providerDiagnostics,
  });

  const combined = providerResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.articles : []
  );
  console.log("RAW PROVIDER COUNT", combined.length);

  const deduped = dedupeArticles(combined);
  const sorted = sortArticlesForMode(deduped, params);
  const locallyFiltered =
    params.mode === "local"
      ? sorted.filter((article) =>
          isQualifiedLocalArticle(article, params.location || params.query)
        )
      : sorted;
  const realArticles = locallyFiltered.filter((article) => !isFallbackArticle(article));
  const enrichedRealArticles =
    params.mode === "trending" && params.page === 1
      ? await enrichTrendingArticleImages(realArticles)
      : realArticles;
  const finalRealArticles =
    params.mode === "trending" ? balanceTrendingArticles(enrichedRealArticles) : enrichedRealArticles;
  const realSliced = finalRealArticles.slice(0, params.pageSize);
  const hasMore = providerResponses.some(
    (result) => result.status === "fulfilled" && result.value.hasMore
  ) || finalRealArticles.length > params.pageSize;
  const fallbackUsed = finalRealArticles.length === 0;

  if (fallbackUsed) {
    console.error("[api/news] All live providers returned zero usable articles", {
      mode: params.mode,
      page: params.page,
      pageSize: params.pageSize,
      query: params.query,
      providerDiagnostics,
    });
  }

  console.log("REAL ARTICLES COUNT", finalRealArticles.length);
  console.log("FALLBACK USED", fallbackUsed);
  console.log(
    "FIRST 5 IMAGE URLS",
    finalRealArticles.slice(0, 5).map((article) => ({
      title: article.title,
      image: article.image,
      imageUrl: article.imageUrl,
      urlToImage: article.urlToImage,
    }))
  );

  const payload =
    realSliced.length > 0
      ? {
          articles: realSliced,
          nextPage: hasMore ? params.page + 1 : null,
          hasMore,
          page: params.page,
          pageSize: params.pageSize,
        }
      : params.mode === "local"
      ? {
          articles: [],
          nextPage: null,
          hasMore: false,
          page: params.page,
          pageSize: params.pageSize,
        }
      : {
          ...buildFallbackArticles(params),
          nextPage: params.page + 1,
          page: params.page,
          pageSize: params.pageSize,
        };

  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return payload;
}

function parseMode(value: string | null): NewsMode {
  if (
    value === "latest" ||
    value === "myfeed" ||
    value === "local" ||
    value === "search" ||
    value === "compare"
  ) {
    return value;
  }

  return "trending";
}

function parseCategories(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}

function shouldUseLegacyArrayResponse(searchParams: URLSearchParams) {
  return !["page", "pageSize", "mode", "query", "q", "category", "location"].some((key) =>
    searchParams.has(key)
  );
}

function jsonResponse(payload: NewsRouteResponse | NormalizedArticle[]) {
  return Response.json(payload, {
    headers: CORS_HEADERS,
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isLegacyRequest = shouldUseLegacyArrayResponse(searchParams);
  const mode = parseMode(searchParams.get("mode"));
  const query = searchParams.get("query")?.trim() ?? searchParams.get("q")?.trim() ?? "";
  const location = searchParams.get("location")?.trim() ?? "";
  const categories = parseCategories(searchParams.get("category"));
  const page = Math.max(1, Number(searchParams.get("page") ?? DEFAULT_PAGE) || DEFAULT_PAGE);
  const maxAllowedPageSize = mode === "compare" ? MAX_COMPARE_PAGE_SIZE : MAX_PAGE_SIZE;
  const pageSize = Math.min(
    maxAllowedPageSize,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  );

  if (isLegacyRequest) {
    const legacyPayload = await collectArticles({
      mode: "trending",
      query: "",
      location: "",
      categories: [],
      page: 1,
      pageSize: 60,
    });

    return jsonResponse(legacyPayload.articles);
  }

  const payload = await collectArticles({
    mode,
    query,
    location,
    categories,
    page,
    pageSize,
  });

  return jsonResponse(payload);
}
