import { looksLikeLowQualityImageUrl } from "../../../lib/article-images";
import {
  getLocalCityConfigByKey,
  LOCAL_CITY_CONFIGS as SHARED_LOCAL_CITY_CONFIGS,
} from "../../../lib/local-news";

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

type NewsMode =
  | "trending"
  | "latest"
  | "myfeed"
  | "search"
  | "compare"
  | "local"
  | "sports"
  | "celebrity";

type ProviderFetchParams = {
  mode: NewsMode;
  query: string;
  location: string;
  cityKey?: string;
  city?: string;
  state?: string;
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
const SPORTS_RSS_SOURCES = [
  "ESPN",
  "Sports Illustrated",
  "CBS Sports",
  "NBC Sports",
  "Fox Sports",
  "Bleacher Report",
  "Yahoo Sports",
  "SB Nation",
] as const;
const SPORTS_QUERY_TERMS = [
  "sports news",
  "NFL news",
  "NBA news",
  "MLB news",
  "NHL news",
  "college football news",
  "college basketball news",
  "soccer news",
] as const;
const SPORTS_SOURCE_SEARCHES = [
  "ESPN",
  "Sports Illustrated",
  "CBS Sports",
  "NBC Sports",
  "Fox Sports",
  "Bleacher Report",
  "Yahoo Sports",
  "SB Nation",
  "The Athletic",
  "SportsCenter",
] as const;
const CELEBRITY_SOURCE_NAMES = [
  "TMZ",
  "People",
  "Entertainment Weekly",
  "E! News",
  "Variety",
  "The Hollywood Reporter",
  "Page Six",
  "Us Weekly",
  "Billboard",
] as const;
const CELEBRITY_QUERY_TERMS = [
  "celebrity news",
  "celebrity gossip",
  "entertainment news",
  "Hollywood news",
  "music celebrity news",
  "TMZ",
  "People",
  "Entertainment Weekly",
  "E! News",
  "Variety",
  "The Hollywood Reporter",
  "Page Six",
  "Us Weekly",
  "Billboard",
] as const;
const SPORTS_API_KEY = process.env.SPORTS_API_KEY ?? "";
const API_SPORTS_KEY = process.env.API_SPORTS_KEY ?? "";
const SPORTSDATA_API_KEY = process.env.SPORTSDATA_API_KEY ?? "";

const NATIONAL_SOURCE_PATTERN =
  /(bbc news|reuters|associated press|ap news|npr|bloomberg|the guardian|al jazeera|newsmax)/i;

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
  Sports:
    "sports news OR NFL news OR NBA news OR MLB news OR NHL news OR college football news OR college basketball news OR soccer news OR golf news OR NASCAR news",
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
    url: "https://rss.cnn.com/rss/cnn_us.rss",
    source: "CNN",
    category: "Breaking News",
    tags: ["breaking", "us", "politics"],
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
    url: "https://variety.com/feed/",
    source: "Variety",
    category: "Celebrity",
    tags: ["celebrity", "entertainment", "hollywood"],
  },
  {
    url: "https://www.billboard.com/feed/",
    source: "Billboard",
    category: "Celebrity",
    tags: ["celebrity", "music", "entertainment"],
  },
  {
    url: "https://pagesix.com/feed/",
    source: "Page Six",
    category: "Celebrity",
    tags: ["celebrity", "gossip", "entertainment"],
  },
  {
    url: "https://www.tmz.com/rss.xml",
    source: "TMZ",
    category: "Celebrity",
    tags: ["celebrity", "gossip", "entertainment"],
  },
  {
    url: "https://ew.com/feed/",
    source: "Entertainment Weekly",
    category: "Celebrity",
    tags: ["celebrity", "entertainment", "hollywood"],
  },
  {
    url: "https://people.com/feed/",
    source: "People",
    category: "Celebrity",
    tags: ["celebrity", "entertainment", "people"],
  },
  {
    url: "https://www.espn.com/espn/rss/news",
    source: "ESPN",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.si.com/rss/si_topstories.rss",
    source: "Sports Illustrated",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.cbssports.com/rss/headlines/",
    source: "CBS Sports",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.nbcsports.com/rss",
    source: "NBC Sports",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.foxsports.com/rss",
    source: "Fox Sports",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://bleacherreport.com/articles/feed",
    source: "Bleacher Report",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://sports.yahoo.com/rss/",
    source: "Yahoo Sports",
    category: "Sports",
    tags: ["sports", "nfl", "nba", "mlb"],
  },
  {
    url: "https://www.sbnation.com/rss/index.xml",
    source: "SB Nation",
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
  {
    url: "https://www.latimes.com/california/rss2.0.xml",
    source: "Los Angeles Times",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://ktla.com/feed/",
    source: "KTLA",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://abc7.com/feed/",
    source: "ABC7 Los Angeles",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://www.nbclosangeles.com/feed/",
    source: "NBC Los Angeles",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://www.cbsnews.com/losangeles/latest/rss/main",
    source: "CBS Los Angeles",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://laist.com/feeds/posts/default",
    source: "LAist",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://www.foxla.com/rss",
    source: "FOX 11 Los Angeles",
    category: "Local News",
    tags: ["los angeles", "california", "local", "socal"],
  },
  {
    url: "https://gothamist.com/feed",
    source: "Gothamist",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://www.nydailynews.com/feed/",
    source: "New York Daily News",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://www.nbcnewyork.com/feed/",
    source: "NBC New York",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://www.cbsnews.com/newyork/latest/rss/main",
    source: "CBS New York",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://abc7ny.com/feed/",
    source: "ABC7NY",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://pix11.com/feed/",
    source: "PIX11",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://www.thecity.nyc/feed/",
    source: "The City NYC",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://www.amny.com/feed/",
    source: "AMNY",
    category: "Local News",
    tags: ["new york", "nyc", "local"],
  },
  {
    url: "https://roughdraftatlanta.com/feed/",
    source: "Rough Draft Atlanta",
    category: "Local News",
    tags: ["atlanta", "georgia", "local"],
  },
  {
    url: "https://saportareport.com/feed/",
    source: "SaportaReport",
    category: "Local News",
    tags: ["atlanta", "georgia", "local"],
  },
  {
    url: "https://www.houstonpublicmedia.org/articles/feed/",
    source: "Houston Public Media",
    category: "Local News",
    tags: ["houston", "texas", "local"],
  },
  {
    url: "https://www.miamiherald.com/latest-news/?outputType=xml",
    source: "Miami Herald",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://wsvn.com/feed/",
    source: "WSVN",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://www.nbcmiami.com/feed/",
    source: "NBC 6 South Florida",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://www.cbsnews.com/miami/latest/rss/main",
    source: "CBS Miami",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://www.local10.com/arc/outboundfeeds/rss/",
    source: "Local 10",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://www.wlrn.org/rss.xml",
    source: "WLRN",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
  {
    url: "https://www.miaminewtimes.com/rss.xml",
    source: "Miami New Times",
    category: "Local News",
    tags: ["miami", "florida", "local", "south florida"],
  },
];

const LOCAL_CITY_CONFIGS = Object.fromEntries(
  Object.values(SHARED_LOCAL_CITY_CONFIGS).map((config) => [
    config.displayName,
    {
      sources: config.allowedSources.map((source) => source.toLowerCase()),
      aliases: config.sourceAliases.map((alias) => alias.toLowerCase()),
      strictTerms: [config.city.toLowerCase(), config.state.toLowerCase(), ...config.strictTerms.map((term) => term.toLowerCase())],
    },
  ])
);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesLocalSignal(text: string, signal: string) {
  const normalizedSignal = signal.trim().toLowerCase();

  if (!normalizedSignal) {
    return false;
  }

  if (normalizedSignal.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedSignal)}([^a-z0-9]|$)`, "i").test(text);
  }

  return text.includes(normalizedSignal);
}

function isQualifiedLocalArticle(
  article: NormalizedArticle,
  location: string,
  cityKey?: string
) {
  const normalizedLocation = location.trim().toLowerCase();
  const localCityConfig = getLocalCityConfig(cityKey, normalizedLocation);

  if (!localCityConfig) {
    return false;
  }

  const [, config] = localCityConfig;
  const sourceName = article.source.trim().toLowerCase();
  const articleText = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${
    article.source
  } ${article.category}`.toLowerCase();
  const hasLocalSourceMatch = config.sources.some((source) => sourceName.includes(source));
  const hasLocalSignalMatch = [...config.strictTerms, ...config.aliases].some((signal) =>
    matchesLocalSignal(articleText, signal)
  );
  const localScore = getLocalMatchScore(article, location, cityKey);

  if (hasLocalSourceMatch) {
    return true;
  }

  if (hasLocalSignalMatch && localScore >= 45) {
    return true;
  }

  return false;
}

function isRelaxedLocalArticle(
  article: NormalizedArticle,
  cityConfig: (typeof SHARED_LOCAL_CITY_CONFIGS)[keyof typeof SHARED_LOCAL_CITY_CONFIGS]
) {
  const sourceName = article.source.trim().toLowerCase();
  const articleText = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${
    article.source
  } ${article.category}`.toLowerCase();
  const localSignals = [
    cityConfig.city.toLowerCase(),
    cityConfig.state.toLowerCase(),
    ...cityConfig.strictTerms.map((term) => term.toLowerCase()),
    ...cityConfig.sourceAliases.map((alias) => alias.toLowerCase()),
  ];
  const hasLocalSourceMatch = cityConfig.allowedSources.some((source) =>
    sourceName.includes(source.toLowerCase())
  );
  const hasLocalSignalMatch = localSignals.some((signal) => matchesLocalSignal(articleText, signal));

  if (hasLocalSourceMatch) {
    return true;
  }

  if (hasLocalSignalMatch && !NATIONAL_SOURCE_PATTERN.test(sourceName)) {
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
  if (mode === "sports") {
    return ["Sports"];
  }

  if (mode === "celebrity") {
    return ["Celebrity"];
  }

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

  if (params.mode === "sports") {
    return (
      params.query.trim() ||
      "sports news OR NFL news OR NBA news OR MLB news OR NHL news OR college football news OR college basketball news OR soccer news OR golf news OR NASCAR news"
    );
  }

  if (params.mode === "celebrity") {
    return (
      params.query.trim() ||
      "celebrity news OR celebrity gossip OR entertainment news OR hollywood news OR music celebrity news OR TMZ OR People OR Entertainment Weekly OR E! News OR Variety OR The Hollywood Reporter OR Page Six OR Us Weekly OR Billboard"
    );
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

function getLocalCityConfig(cityKey: string | undefined, query: string) {
  const fromKey = getLocalCityConfigByKey(cityKey);

  if (fromKey) {
    return (
      Object.entries(LOCAL_CITY_CONFIGS).find(([displayName]) => displayName === fromKey.displayName) ??
      null
    );
  }

  const normalized = query.trim().toLowerCase();

  return (
    Object.entries(LOCAL_CITY_CONFIGS).find(([, config]) =>
      [...config.strictTerms, ...config.aliases].some((signal) => matchesLocalSignal(normalized, signal))
    ) ?? null
  );
}

function getLocalMatchScore(article: NormalizedArticle, location: string, cityKey?: string) {
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
  const localCityConfig = getLocalCityConfig(cityKey, normalizedLocation);

  if (localCityConfig) {
    const [, config] = localCityConfig;

    if (config.sources.some((source) => sourceName.includes(source))) {
      score += 120;
    }

    if ([...config.strictTerms, ...config.aliases].some((signal) => matchesLocalSignal(articleText, signal))) {
      score += 70;
    }

    if (
      /(fox news|cnn|reuters|associated press|ap news|nbc news|cbs news|abc news|newsmax|bbc news)/.test(
        sourceName
      ) &&
      ![...config.strictTerms, ...config.aliases].some((signal) =>
        matchesLocalSignal(articleText, signal)
      )
    ) {
      score -= 55;
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
      const sourceBoost =
        sourceKey === "cnn"
          ? 0.02
          : sourceKey === "bbc news" || sourceKey === "npr"
            ? -0.01
            : 0;
      const launchScore =
        getLaunchRecencyScore(article) * 0.46 +
        getProviderOrderScore(index, articles.length) * 0.31 +
        (1 / sourceCount) * 0.15 +
        (1 / categoryCount) * 0.06 +
        engagementScore * 0.02 -
        Math.max(0, sourceCount - 2) * 0.015 +
        sourceBoost;

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
  const bestByKey = new Map<string, NormalizedArticle>();

  const getImageScore = (article: NormalizedArticle) =>
    Number(Boolean(article.urlToImage || article.imageUrl || article.image || article.ogImage)) +
    Number(Boolean(article.mediaContent || article.enclosureUrl || article.twitterImage));

  const isBetterArticle = (candidate: NormalizedArticle, current: NormalizedArticle) => {
    const candidateTime = getPublishedTime(candidate);
    const currentTime = getPublishedTime(current);
    const candidateImageScore = getImageScore(candidate);
    const currentImageScore = getImageScore(current);

    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }

    if (candidateImageScore !== currentImageScore) {
      return candidateImageScore > currentImageScore;
    }

    return candidate.title.length > current.title.length;
  };

  articles.forEach((article) => {
    const normalizedUrl = normalizeUrl(article.url);
    const titleFingerprint = buildTitleFingerprint(article.title);
    const sourceKey = article.source.trim().toLowerCase();
    const keys = [
      normalizedUrl ? `url:${normalizedUrl}` : null,
      titleFingerprint ? `title:${sourceKey}:${titleFingerprint}` : null,
    ].filter(Boolean) as string[];

    if (keys.length === 0) {
      keys.push(`id:${article.id}`);
    }

    const existing = keys
      .map((key) => bestByKey.get(key))
      .find((value): value is NormalizedArticle => Boolean(value));

    const bestArticle = existing && !isBetterArticle(article, existing) ? existing : article;

    keys.forEach((key) => {
      bestByKey.set(key, bestArticle);
    });
  });

  const seenArticles = new Set<string>();
  return Array.from(bestByKey.values()).filter((article) => {
    const identity = `${article.id}:${normalizeUrl(article.url)}:${buildTitleFingerprint(article.title)}:${article.source}`;
    if (seenArticles.has(identity)) {
      return false;
    }
    seenArticles.add(identity);
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
  params: Pick<ProviderFetchParams, "mode" | "query" | "location" | "cityKey">
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
        getLocalMatchScore(right, params.location || params.query, params.cityKey) -
        getLocalMatchScore(left, params.location || params.query, params.cityKey);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  if (params.mode === "sports" || params.mode === "celebrity") {
    return [...articles].sort((left, right) => {
      const scoreDiff = getMatchScore(right, getEffectiveQuery(params)) - getMatchScore(left, getEffectiveQuery(params));

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

  if (
    (params.mode === "search" ||
      params.mode === "compare" ||
      params.mode === "local" ||
      params.mode === "sports" ||
      params.mode === "celebrity") &&
    effectiveQuery
  ) {
    const encodedQuery = encodeURIComponent(effectiveQuery);
    const exactQuery = encodeURIComponent(`"${effectiveQuery}"`);
    requests.push(
      {
        url: `https://newsapi.org/v2/everything?q=${exactQuery}&language=en&sortBy=publishedAt&page=${params.page}&pageSize=${Math.max(
          params.mode === "compare"
            ? 20
            : params.mode === "local"
              ? 14
              : params.mode === "sports" || params.mode === "celebrity"
                ? 18
                : 8,
          Math.ceil(params.pageSize / 2)
        )}`,
        category: "Search",
      },
      {
        url: `https://newsapi.org/v2/everything?q=${encodedQuery}&language=en&sortBy=publishedAt&page=${params.page}&pageSize=${Math.max(
          params.mode === "compare"
            ? 30
            : params.mode === "local"
              ? 20
              : params.mode === "sports" || params.mode === "celebrity"
                ? 28
                : 10,
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

  if (
    (params.mode === "search" ||
      params.mode === "compare" ||
      params.mode === "local" ||
      params.mode === "sports" ||
      params.mode === "celebrity") &&
    effectiveQuery
  ) {
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

  if (
    (params.mode === "search" ||
      params.mode === "compare" ||
      params.mode === "local" ||
      params.mode === "sports" ||
      params.mode === "celebrity") &&
    effectiveQuery
  ) {
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

async function fetchRssFeedSet(
  feeds: RssFeedConfig[],
  limit: number
): Promise<NormalizedArticle[]> {
  const responses = await Promise.allSettled(
    feeds.slice(0, limit).map(async (feed) => {
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

  return responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("RSS provider error:", result.reason);
    return [];
  });
}

async function fetchRssArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  const candidateFeeds =
    (params.mode === "search" ||
      params.mode === "compare" ||
      params.mode === "local" ||
      params.mode === "sports" ||
      params.mode === "celebrity") &&
    getEffectiveQuery(params)
      ? RSS_FEEDS
      : RSS_FEEDS.filter((feed) => {
          const modeCategories = getModeCategories(params.mode, params.categories);
          return modeCategories.includes(feed.category);
        });

  const feedsToFetch =
    params.mode === "local" &&
    getLocalCityConfig(params.cityKey, params.location || params.query)
      ? RSS_FEEDS.filter(
          (feed) =>
            (getLocalCityConfig(params.cityKey, params.location || params.query)?.[1].sources ?? []).some(
              (source) => feed.source.toLowerCase().includes(source)
            ) ||
            [
              ...(getLocalCityConfig(params.cityKey, params.location || params.query)?.[1].strictTerms ?? []),
              ...(getLocalCityConfig(params.cityKey, params.location || params.query)?.[1].aliases ?? []),
            ].some(
              (signal) =>
                matchesLocalSignal(feed.source.toLowerCase(), signal) ||
                feed.tags.some((tag) => matchesLocalSignal(tag.toLowerCase(), signal))
            )
        )
      : candidateFeeds.length > 0
      ? candidateFeeds
      : RSS_FEEDS;

  let articles = await fetchRssFeedSet(
    feedsToFetch,
    params.mode === "compare"
      ? 10
      : params.mode === "trending"
      ? 12
      : params.mode === "local"
      ? 10
      : params.mode === "latest"
      ? 10
      : params.mode === "sports"
      ? 12
      : 8
  );

  if ((params.mode === "search" || params.mode === "compare") && params.query.trim()) {
    articles = articles.filter((article) => getMatchScore(article, params.query) > 0);
  }

  if (params.mode === "local") {
    const locationQuery = params.location || params.query;
    articles = articles.filter((article) =>
      isQualifiedLocalArticle(article, locationQuery, params.cityKey)
    );
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

async function fetchLocalArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const localCity = getLocalCityConfigByKey(params.cityKey);

  if (!localCity) {
    return {
      articles: [],
      nextPage: null,
      hasMore: false,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  console.log("LOCAL CITY CONFIG USED", localCity.cityKey, localCity);
  console.log("WORKING LOCAL PATTERN USED FOR", localCity.cityKey);

  const cityFeeds = RSS_FEEDS.filter((feed) =>
    localCity.rssFeeds.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(cityFeeds, Math.max(cityFeeds.length, 1));

  const sourceQueryResponses = await Promise.allSettled(
    localCity.searchQueries.slice(0, 10).map((query) =>
      Promise.all([
        fetchNewsApiArticles({
          ...params,
          mode: "search",
          query,
        }),
        fetchGNewsArticles({
          ...params,
          mode: "search",
          query,
        }),
        fetchNewsDataArticles({
          ...params,
          mode: "search",
          query,
        }),
      ])
    )
  );

  const sourceQueryArticles = sourceQueryResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.flatMap((response) => response.articles) : []
  );

  const cityQueryArticles = (
    await Promise.all([
      fetchNewsApiArticles({
        ...params,
        mode: "search",
        query: `${localCity.city} local news`,
      }),
      fetchGNewsArticles({
        ...params,
        mode: "search",
        query: `${localCity.city} local news`,
      }),
      fetchNewsDataArticles({
        ...params,
        mode: "search",
        query: `${localCity.city} local news`,
      }),
    ])
  ).flatMap((response) => response.articles);

  console.log("LOCAL RSS/API COUNTS", {
    cityKey: localCity.cityKey,
    rss: rssArticles.length,
    sourceQueries: sourceQueryArticles.length,
    cityQuery: cityQueryArticles.length,
  });

  const rawArticles = dedupeArticles([...rssArticles, ...sourceQueryArticles, ...cityQueryArticles]);
  console.log("LOCAL RAW COUNT", rawArticles.length);
  console.log("LOCAL CITY", localCity.cityKey, localCity.city, localCity.state);
  console.log("LOCAL SOURCES USED", localCity.allowedSources);

  const strictFiltered = sortArticlesForMode(rawArticles, params).filter((article) =>
    isQualifiedLocalArticle(article, params.location || params.query, params.cityKey)
  );
  const filteredArticles =
    strictFiltered.length >= 5
      ? strictFiltered
      : sortArticlesForMode(rawArticles, params).filter((article) =>
          isRelaxedLocalArticle(article, localCity)
        );
  console.log("LOCAL FILTERED COUNT", filteredArticles.length);
  const sliced = filteredArticles.slice(0, params.pageSize);

  console.log(
    "LOCAL FINAL SOURCES",
    Array.from(new Set(sliced.map((article) => article.sourceName || article.source))).sort()
  );
  console.log("LOCAL FINAL COUNT", sliced.length);

  return {
    articles: sliced,
    nextPage: filteredArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: filteredArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchSportsArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const sportsCategory = params.query.trim() || "All Sports";
  const sportsFeeds = RSS_FEEDS.filter((feed) =>
    SPORTS_RSS_SOURCES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(sportsFeeds, sportsFeeds.length);
  const categoryQueries = sportsCategory
    ? sportsCategory
        .split("|")
        .map((query) => query.trim())
        .filter(Boolean)
    : [];
  const effectiveQueries = Array.from(
    new Set([...categoryQueries, ...SPORTS_QUERY_TERMS, ...SPORTS_SOURCE_SEARCHES])
  );
  const queryResponses = await Promise.allSettled(
    effectiveQueries.map((query) =>
      Promise.all([
        fetchNewsApiArticles({ ...params, mode: "search", query }),
        fetchGNewsArticles({ ...params, mode: "search", query }),
        fetchNewsDataArticles({ ...params, mode: "search", query }),
      ])
    )
  );
  const queryArticles = queryResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.flatMap((response) => response.articles) : []
  );
  const combined = dedupeArticles([...rssArticles, ...queryArticles]);
  const categoryPattern = new RegExp(
    categoryQueries.length > 0
      ? categoryQueries
          .flatMap((query) => query.toLowerCase().split(/[^a-z0-9]+/i))
          .filter((term) => term.length > 2)
          .join("|")
      : "sports|nfl|nba|mlb|nhl|soccer|golf|nascar|formula|wnba|college",
    "i"
  );
  const sportsArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const text = `${article.title} ${article.description ?? ""} ${article.category}`.toLowerCase();
    return (
      article.category.toLowerCase() === "sports" ||
      SPORTS_RSS_SOURCES.some((name) => source.includes(name.toLowerCase())) ||
      /the athletic|sports illustrated|sportscenter/.test(source) ||
      /(nfl|nba|mlb|nhl|soccer|golf|nascar|formula|playoff|season|league|coach|draft|wnba|college)/.test(
        text
      )
    );
  }).filter((article) => categoryPattern.test(`${article.title} ${article.description ?? ""} ${article.source}`));

  console.log("SPORTS CATEGORY", sportsCategory);
  console.log("SPORTS ARTICLE COUNT", sportsArticles.length);
  console.log("SPORTS FINAL COUNT", sportsArticles.length);

  return {
    articles: sportsArticles.slice(0, params.pageSize),
    nextPage: sportsArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: sportsArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchCelebrityArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const celebrityFeeds = RSS_FEEDS.filter((feed) =>
    CELEBRITY_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(celebrityFeeds, celebrityFeeds.length);
  const effectiveQueries = Array.from(new Set([...CELEBRITY_QUERY_TERMS, ...CELEBRITY_SOURCE_NAMES]));
  const queryResponses = await Promise.allSettled(
    effectiveQueries.map((query) =>
      Promise.all([
        fetchNewsApiArticles({ ...params, mode: "search", query }),
        fetchGNewsArticles({ ...params, mode: "search", query }),
        fetchNewsDataArticles({ ...params, mode: "search", query }),
      ])
    )
  );
  const queryArticles = queryResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.flatMap((response) => response.articles) : []
  );
  const combined = dedupeArticles([...rssArticles, ...queryArticles]);
  const celebrityPattern =
    /(celebrity|gossip|hollywood|entertainment|music|tmz|people|ew|e!\s*news|variety|hollywood reporter|page six|us weekly|billboard)/i;
  const celebrityArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const text = `${article.title} ${article.description ?? ""} ${article.category}`.toLowerCase();
    return (
      article.category.toLowerCase() === "celebrity" ||
      CELEBRITY_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase())) ||
      celebrityPattern.test(text)
    );
  });

  return {
    articles: celebrityArticles.slice(0, params.pageSize),
    nextPage: celebrityArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: celebrityArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function collectArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  if (params.mode === "local" && !getLocalCityConfig(params.cityKey, params.location || params.query)) {
    return {
      articles: [],
      nextPage: null,
      hasMore: false,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  if (params.mode === "local") {
    return fetchLocalArticles(params);
  }

  if (params.mode === "sports") {
    return fetchSportsArticles(params);
  }

  if (params.mode === "celebrity") {
    return fetchCelebrityArticles(params);
  }

  const cacheKey = JSON.stringify({
    mode: params.mode,
    cityKey: params.cityKey,
    city: params.city,
    state: params.state,
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
      sportsApi: Boolean(SPORTS_API_KEY),
      apiSports: Boolean(API_SPORTS_KEY),
      sportsData: Boolean(SPORTSDATA_API_KEY),
    },
    providers: providerDiagnostics,
  });

  const combined = providerResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.articles : []
  );
  console.log("RAW PROVIDER COUNT", combined.length);

  const deduped = dedupeArticles(combined);
  const sorted = sortArticlesForMode(deduped, params);
  const realArticles = sorted.filter((article) => !isFallbackArticle(article));
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
    value === "sports" ||
    value === "celebrity" ||
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
  const cityKey = searchParams.get("cityKey")?.trim() ?? "";
  const city = searchParams.get("city")?.trim() ?? "";
  const state = searchParams.get("state")?.trim() ?? "";
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
    cityKey,
    city,
    state,
    categories,
    page,
    pageSize,
  });

  return jsonResponse(payload);
}
