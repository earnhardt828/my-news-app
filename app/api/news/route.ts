import { looksLikeLowQualityImageUrl } from "../../../lib/article-images";
import {
  getLocalCityConfigByKey,
  LOCAL_CITY_CONFIGS as SHARED_LOCAL_CITY_CONFIGS,
  SUPPORTED_LOCAL_CITIES,
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
  provider: string;
};

type NewsMode =
  | "trending"
  | "latest"
  | "myfeed"
  | "search"
  | "compare"
  | "local"
  | "sports"
  | "celebrity"
  | "trump"
  | "weather"
  | "technology"
  | "travel"
  | "food"
  | "business";

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

type MediaStackApiResponse = {
  data?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    image?: string | null;
    published_at?: string | null;
    source?: string | null;
    category?: string | null;
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
    author?: string | null;
    category?: string[] | null;
  }>;
};

type GuardianApiResponse = {
  response?: {
    results?: Array<{
      webTitle?: string | null;
      webUrl?: string | null;
      webPublicationDate?: string | null;
      sectionName?: string | null;
      fields?: {
        trailText?: string | null;
        thumbnail?: string | null;
        headline?: string | null;
        bodyText?: string | null;
      } | null;
    }>;
  };
};

type NytTopStoriesResponse = {
  results?: Array<{
    title?: string | null;
    abstract?: string | null;
    url?: string | null;
    published_date?: string | null;
    section?: string | null;
    subsection?: string | null;
    multimedia?: Array<{
      url?: string | null;
      width?: number | null;
      height?: number | null;
      format?: string | null;
    }> | null;
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

type SourceAliasRule = {
  match: RegExp;
  canonical: string;
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
  "AP News",
  "AP Sports",
  "BBC Sport",
  "Sports Illustrated",
  "Motorsport.com",
  "MLB.com",
  "NBA.com",
  "NFL.com",
  "NHL.com",
  "Sportsnet NHL",
  "The Hockey News",
  "TSN Hockey",
  "MLSsoccer.com",
  "CBS Sports Golazo",
  "NBC Sports Soccer",
  "Fox Sports Soccer",
  "Yahoo Sports Soccer",
  "AP Soccer",
  "Reuters Soccer",
  "The Athletic Soccer",
  "CBS Sports",
  "NBC Sports",
  "Fox Sports",
  "Bleacher Report",
  "Yahoo Sports",
  "Reuters Sports",
  "SB Nation",
  "MMA Fighting",
  "FC Cincinnati",
  "Charlotte FC",
  "Inter Miami",
  "LAFC",
  "Atlanta United",
  "Seattle Sounders",
  "NASCAR.com",
  "Big 12 Conference",
  "HERO Sports",
  "The Athletic",
] as const;
const SPORTS_QUERY_TERMS = [
  "sports news",
  "Motorsport.com",
  "NFL news",
  "NBA news",
  "NBA latest",
  "ESPN NBA",
  "Bleacher Report NBA",
  "Yahoo Sports NBA",
  "CBS Sports NBA",
  "NBC Sports NBA",
  "NBA.com",
  "MLB news",
  "baseball news",
  "MLB.com latest",
  "ESPN MLB",
  "AP MLB",
  "Reuters MLB",
  "CBS Sports MLB",
  "NBC Sports MLB",
  "Fox Sports MLB",
  "Yahoo Sports MLB",
  "Bleacher Report MLB",
  "The Athletic MLB",
  "NHL news",
  "hockey news",
  "NHL.com latest",
  "ESPN NHL",
  "Sportsnet NHL",
  "The Hockey News",
  "TSN Hockey",
  "AP NHL",
  "Reuters NHL",
  "CBS Sports NHL",
  "NBC Sports NHL",
  "Yahoo Sports NHL",
  "Bleacher Report NHL",
  "NFL latest",
  "football news",
  "NFL injuries",
  "NFL offseason",
  "NFL draft",
  "NFL training camp",
  "NFL teams",
  "NFL.com latest",
  "ESPN NFL",
  "AP NFL",
  "Reuters NFL",
  "CBS Sports NFL",
  "NBC Sports NFL",
  "Fox Sports NFL",
  "Yahoo Sports NFL",
  "Bleacher Report NFL",
  "Sports Illustrated NFL",
  "MLS news",
  "Major League Soccer news",
  "MLSsoccer.com",
  "FC Cincinnati",
  "Charlotte FC",
  "Inter Miami",
  "LAFC",
  "Atlanta United",
  "Seattle Sounders",
  "ESPN Soccer",
  "ESPN MLS",
  "CBS Sports Golazo",
  "NBC Sports Soccer",
  "Fox Sports Soccer",
  "Yahoo Sports Soccer",
  "AP Soccer",
  "Reuters Soccer",
  "The Athletic Soccer",
  "local MLS team news",
  "MMA news",
  "college football news",
  "college basketball news",
  "NASCAR.com",
  "Big 12 Conference",
  "HERO Sports",
  "soccer news",
  "Reuters Sports",
  "AP Sports",
  "local sports stations",
] as const;
const SPORTS_SOURCE_SEARCHES = [
  "ESPN",
  "AP News Sports",
  "AP Sports",
  "BBC Sport",
  "Sports Illustrated",
  "Motorsport.com",
  "MLB.com",
  "NBA.com",
  "NFL.com",
  "NHL.com",
  "MLSsoccer.com",
  "CBS Sports Golazo",
  "NBC Sports Soccer",
  "Fox Sports Soccer",
  "Yahoo Sports Soccer",
  "AP Soccer",
  "Reuters Soccer",
  "The Athletic Soccer",
  "CBS Sports",
  "NBC Sports",
  "Fox Sports",
  "Bleacher Report",
  "Yahoo Sports",
  "Reuters Sports",
  "FC Cincinnati",
  "NASCAR.com",
  "Big 12 Conference",
  "HERO Sports",
  "NBA.com",
  "NFL.com",
  "MLB.com",
  "NHL.com",
  "Sportsnet NHL",
  "The Hockey News",
  "TSN Hockey",
  "MLSsoccer.com",
  "CBS Sports Golazo",
  "NBC Sports Soccer",
  "Fox Sports Soccer",
  "Yahoo Sports Soccer",
  "AP Soccer",
  "Reuters Soccer",
  "The Athletic Soccer",
  "SB Nation",
  "The Athletic",
  "The Athletic MLB",
  "The Athletic NBA",
  "The Athletic soccer",
  "Charlotte FC",
  "Inter Miami",
  "LAFC",
  "Atlanta United",
  "Seattle Sounders",
  "CBS Sports NFL",
  "NBC Sports NFL",
  "Fox Sports NFL",
  "CBS Sports MLB",
  "NBC Sports MLB",
  "Fox Sports MLB",
  "Yahoo Sports MLB",
  "CBS Sports NHL",
  "NBC Sports NHL",
  "Yahoo Sports NHL",
  "Bleacher Report NHL",
  "AP NFL",
  "Reuters NFL",
  "CBS Sports NBA",
  "NBC Sports NBA",
  "SportsCenter",
  "MMA Fighting",
] as const;
const CELEBRITY_SOURCE_NAMES = [
  "TMZ",
  "People",
  "Entertainment Tonight",
  "Access Hollywood",
  "Extra",
  "Deadline",
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
  "Entertainment Tonight",
  "Access Hollywood",
  "Extra",
  "Deadline",
  "Entertainment Weekly",
  "E! News",
  "Variety",
  "The Hollywood Reporter",
  "Page Six",
  "Us Weekly",
  "Billboard",
] as const;
const BLOCKED_FEED_SOURCE_PATTERN =
  /\b(kanak news|kanak news odisha)\b/i;
const BLOCKED_FEED_URL_PATTERN = /kanaknews\.com/i;
const TRUMP_QUERY_TERMS = [
  "Donald Trump news",
  "Trump administration news",
  "Trump policy news",
  "Trump White House",
  "Trump legal news",
  "Trump economy",
  "Trump immigration",
  "Trump tariffs",
  "Trump latest",
] as const;
const TRUMP_SOURCE_NAMES = [
  "AP News",
  "Reuters",
  "CNN",
  "Fox News",
  "NBC News",
  "CBS News",
  "ABC News",
  "The Hill",
  "Politico",
  "Axios",
  "Washington Post",
  "New York Times",
] as const;
const WEATHER_SOURCE_NAMES = [
  "The Weather Channel",
  "AccuWeather",
  "AP News",
  "NOAA",
  "National Weather Service",
  "CNN Weather",
  "Fox Weather",
] as const;
const WEATHER_QUERY_TERMS = [
  "weather news",
  "severe weather news",
  "hurricane news",
  "tornado news",
  "flooding news",
  "winter storm news",
  "wildfire weather news",
  "NOAA weather alerts",
  "National Weather Service news",
  "climate weather news",
  "Fox Weather latest",
  "AccuWeather latest",
  "The Weather Channel latest",
] as const;
const TECHNOLOGY_SOURCE_NAMES = [
  "The Verge",
  "TechCrunch",
  "Wired",
  "Ars Technica",
  "Engadget",
  "CNET",
  "CNBC Tech",
  "Bloomberg Technology",
] as const;
const TECHNOLOGY_QUERY_TERMS = [
  "technology news",
  "AI news",
  "tech startups",
  "Apple news",
  "Google news",
  "Microsoft news",
  "cybersecurity news",
  "social media news",
  "The Verge",
  "TechCrunch",
  "Wired",
  "Ars Technica",
  "Engadget",
  "CNET",
  "CNBC Tech",
  "Bloomberg Technology",
] as const;
const TRAVEL_SOURCE_NAMES = [
  "Travel + Leisure",
  "Condé Nast Traveler",
  "AFAR",
  "Skift",
  "The Points Guy",
  "CNN Travel",
  "National Geographic Travel",
  "Lonely Planet",
  "USA Today Travel",
] as const;
const TRAVEL_QUERY_TERMS = [
  "travel news",
  "airline news",
  "airport news",
  "cruise news",
  "tourism news",
  "travel warning",
  "travel advisory",
  "hotel news",
  "vacation travel news",
  "Travel + Leisure",
  "Condé Nast Traveler",
  "AFAR",
  "Skift",
  "The Points Guy",
  "CNN Travel",
  "National Geographic Travel",
  "Lonely Planet",
  "USA Today Travel",
] as const;
const FOOD_SOURCE_NAMES = [
  "Eater",
  "Food & Wine",
  "Bon Appétit",
  "Serious Eats",
  "NYT Cooking",
  "Taste of Home",
  "Allrecipes",
  "Delish",
  "Epicurious",
  "Saveur",
  "Restaurant Business",
  "Food Network",
  "CNN Food",
  "USA Today Food",
] as const;
const FOOD_QUERY_TERMS = [
  "food news",
  "restaurant news",
  "fast food news",
  "food safety",
  "grocery news",
  "recipes news",
  "dining news",
  "Eater",
  "Food & Wine",
  "Bon Appétit",
  "Serious Eats",
  "NYT Cooking",
  "Taste of Home",
  "Allrecipes",
  "Delish",
  "Epicurious",
  "Saveur",
  "Restaurant Business",
  "Food Network",
  "CNN Food",
  "USA Today Food",
] as const;
const SPORTS_API_KEY = process.env.SPORTS_API_KEY ?? "";
const API_SPORTS_KEY = process.env.API_SPORTS_KEY ?? "";
const SPORTSDATA_API_KEY = process.env.SPORTSDATA_API_KEY ?? "";
const MEDIASTACK_API_KEY = process.env.MEDIASTACK_API_KEY ?? "";
const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss";
const SOURCE_ALIAS_RULES: SourceAliasRule[] = [
  { match: /(^|\b)associated press(\b|$)|(^|\b)ap news(\b|$)|(^|\b)ap(\b|$)/i, canonical: "AP News" },
  { match: /(^|\b)reuters(\b|$)/i, canonical: "Reuters" },
  { match: /(^|\b)cnn(\b|$)/i, canonical: "CNN" },
  { match: /(^|\b)bbc(\b|$)/i, canonical: "BBC News" },
  { match: /(^|\b)nbc news(\b|$)/i, canonical: "NBC News" },
  { match: /(^|\b)cbs news(\b|$)/i, canonical: "CBS News" },
  { match: /(^|\b)abc news(\b|$)/i, canonical: "ABC News" },
  { match: /(^|\b)the new york times(\b|$)|(^|\b)new york times(\b|$)/i, canonical: "The New York Times" },
  { match: /(^|\b)the washington post(\b|$)|(^|\b)washington post(\b|$)/i, canonical: "The Washington Post" },
  { match: /(^|\b)fox news(\b|$)/i, canonical: "Fox News" },
  { match: /(^|\b)espn(\b|$)/i, canonical: "ESPN" },
  { match: /(^|\b)bbc sport(\b|$)/i, canonical: "BBC Sport" },
  { match: /(^|\b)motorsport\.com(\b|$)|(^|\b)motorsport(\b|$)/i, canonical: "Motorsport.com" },
  { match: /(^|\b)sports illustrated(\b|$)|(^|\b)si\.com(\b|$)/i, canonical: "Sports Illustrated" },
  { match: /(^|\b)mlb\.com(\b|$)|(^|\b)mlb com(\b|$)/i, canonical: "MLB.com" },
  { match: /(^|\b)nba\.com(\b|$)|(^|\b)nba com(\b|$)/i, canonical: "NBA.com" },
  { match: /(^|\b)nfl\.com(\b|$)|(^|\b)nfl com(\b|$)/i, canonical: "NFL.com" },
  { match: /(^|\b)nhl\.com(\b|$)|(^|\b)nhl com(\b|$)/i, canonical: "NHL.com" },
  { match: /(^|\b)mlssoccer\.com(\b|$)|(^|\b)mlssoccer(\b|$)|(^|\b)major league soccer(\b|$)/i, canonical: "MLSsoccer.com" },
  { match: /(^|\b)cbs sports(\b|$)/i, canonical: "CBS Sports" },
  { match: /(^|\b)nbc sports(\b|$)/i, canonical: "NBC Sports" },
  { match: /(^|\b)fox sports(\b|$)/i, canonical: "Fox Sports" },
  { match: /(^|\b)bleacher report(\b|$)/i, canonical: "Bleacher Report" },
  { match: /(^|\b)yahoo sports(\b|$)/i, canonical: "Yahoo Sports" },
  { match: /(^|\b)reuters sports(\b|$)/i, canonical: "Reuters Sports" },
  { match: /(^|\b)ap sports(\b|$)/i, canonical: "AP Sports" },
  { match: /(^|\b)fc cincinnati(\b|$)/i, canonical: "FC Cincinnati" },
  { match: /(^|\b)sb nation(\b|$)/i, canonical: "SB Nation" },
  { match: /(^|\b)mma fighting(\b|$)/i, canonical: "MMA Fighting" },
  { match: /(^|\b)khou(\b|$)/i, canonical: "KHOU Houston" },
  { match: /(^|\b)click2houston(\b|$)|(^|\b)kprc(\b|$)/i, canonical: "KPRC 2 Houston" },
  { match: /(^|\b)abc13(\b|$)/i, canonical: "ABC13 Houston" },
  { match: /(^|\b)fox 26(\b|$)/i, canonical: "FOX 26 Houston" },
  { match: /(^|\b)nbc 7(\b|$)|nbc7sandiego/i, canonical: "NBC 7 San Diego" },
  { match: /(^|\b)abc 10news(\b|$)|10news\.com/i, canonical: "ABC 10News San Diego" },
  { match: /(^|\b)cbs 8(\b|$)|cbs8\.com/i, canonical: "CBS 8 San Diego" },
  { match: /(^|\b)fox 5 san diego(\b|$)|fox5sandiego/i, canonical: "FOX 5 San Diego" },
  { match: /(^|\b)kpbs(\b|$)/i, canonical: "KPBS San Diego" },
  { match: /(^|\b)wfaa(\b|$)/i, canonical: "WFAA Dallas" },
  { match: /(^|\b)nbc 5(\b|$)/i, canonical: "NBC 5 Dallas-Fort Worth" },
  { match: /(^|\b)fox 4 dallas(\b|$)|(^|\b)fox 4(\b|$)/i, canonical: "FOX 4 Dallas" },
  { match: /(^|\b)kxan(\b|$)/i, canonical: "KXAN Austin" },
  { match: /(^|\b)kvue(\b|$)/i, canonical: "KVUE Austin" },
  { match: /(^|\b)kens5(\b|$)/i, canonical: "KENS5 San Antonio" },
  { match: /(^|\b)texas public radio(\b|$)|(^|\b)kut(\b|$)/i, canonical: "Texas Public Radio" },
];
const SOURCE_QUALITY_RULES: Array<{ match: RegExp; score: number }> = [
  { match: /(^|\b)(ap news|reuters)(\b|$)/i, score: 1 },
  { match: /(^|\b)(bbc news|the new york times|the washington post|bloomberg)(\b|$)/i, score: 0.96 },
  { match: /(^|\b)(cnn|npr|politico|the hill|nbc news|cbs news|abc news|fox news)(\b|$)/i, score: 0.91 },
  { match: /(^|\b)(espn|sports illustrated|cbs sports|nbc sports|fox sports|bleacher report|yahoo sports|sb nation)(\b|$)/i, score: 0.88 },
  { match: /(^|\b)(the verge|techcrunch|wired|ars technica|engadget|cnet|bloomberg technology)(\b|$)/i, score: 0.86 },
  { match: /(^|\b)(weather channel|accuweather|fox weather|national weather service|noaa|cnn weather)(\b|$)/i, score: 0.84 },
  { match: /(^|\b)(gothamist|block club chicago|houston chronicle|charlotte observer|los angeles times|san diego union tribune|times of san diego|dallas morning news|wfaa|khou|kxan|kvue|ksat|kens5|nbc 7 san diego|abc 10news san diego|cbs 8 san diego|kpbs)(\b|$)/i, score: 0.82 },
];

const NATIONAL_SOURCE_PATTERN =
  /(bbc news|reuters|associated press|ap news|npr|bloomberg|the guardian|al jazeera|newsmax)/i;

const NEWS_API_KEY =
  process.env.NEWS_API_KEY ??
  process.env.NEWSAPI_KEY ??
  process.env.NEXT_PUBLIC_NEWS_API_KEY ??
  "";
const GNEWS_API_KEY = process.env.GNEWS_API_KEY ?? "";
const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY ?? "";
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? "";
const NYT_API_KEY = process.env.NYT_API_KEY ?? "";
const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY ?? "";
const BING_NEWS_API_KEY = process.env.BING_NEWS_API_KEY ?? "";

function logProviderSkip(providerName: string, reason: string) {
  console.warn(`[api/news] Skipping ${providerName}: ${reason}`);
}

function logProviderRequest(providerName: string, details: Record<string, unknown>) {
  console.log("NEWS PROVIDER REQUEST", {
    provider: providerName,
    ...details,
  });
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
    url: "https://www.theverge.com/rss/index.xml",
    source: "The Verge",
    category: "Tech",
    tags: ["technology", "ai", "gadgets"],
  },
  {
    url: "https://techcrunch.com/feed/",
    source: "TechCrunch",
    category: "Tech",
    tags: ["technology", "ai", "startup"],
  },
  {
    url: "https://www.wired.com/feed/rss",
    source: "Wired",
    category: "Tech",
    tags: ["technology", "ai", "cybersecurity"],
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/index",
    source: "Ars Technica",
    category: "Tech",
    tags: ["technology", "ai", "cybersecurity"],
  },
  {
    url: "https://www.engadget.com/rss.xml",
    source: "Engadget",
    category: "Tech",
    tags: ["technology", "gadgets", "ai"],
  },
  {
    url: "https://www.cnet.com/rss/news/",
    source: "CNET",
    category: "Tech",
    tags: ["technology", "consumer tech", "ai"],
  },
  {
    url: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    source: "CNBC Tech",
    category: "Tech",
    tags: ["technology", "ai", "business"],
  },
  {
    url: "https://feeds.bloomberg.com/technology/news.rss",
    source: "Bloomberg Technology",
    category: "Tech",
    tags: ["technology", "ai", "business"],
  },
  {
    url: "https://www.travelandleisure.com/rss",
    source: "Travel + Leisure",
    category: "Travel",
    tags: ["travel", "tourism", "vacation"],
  },
  {
    url: "https://www.cntraveler.com/feed/rss",
    source: "Condé Nast Traveler",
    category: "Travel",
    tags: ["travel", "tourism", "destination"],
  },
  {
    url: "https://www.afar.com/magazine/rss.xml",
    source: "AFAR",
    category: "Travel",
    tags: ["travel", "destinations", "tourism"],
  },
  {
    url: "https://skift.com/feed/",
    source: "Skift",
    category: "Travel",
    tags: ["travel", "airline", "tourism"],
  },
  {
    url: "https://thepointsguy.com/news/feed/",
    source: "The Points Guy",
    category: "Travel",
    tags: ["travel", "airline", "hotel"],
  },
  {
    url: "https://www.cnn.com/travel/rss",
    source: "CNN Travel",
    category: "Travel",
    tags: ["travel", "tourism", "airline"],
  },
  {
    url: "https://www.nationalgeographic.com/travel/rss",
    source: "National Geographic Travel",
    category: "Travel",
    tags: ["travel", "destination", "tourism"],
  },
  {
    url: "https://www.lonelyplanet.com/rss.xml",
    source: "Lonely Planet",
    category: "Travel",
    tags: ["travel", "destination", "tourism"],
  },
  {
    url: "https://rssfeeds.usatoday.com/UsatodaycomTravel-TopStories",
    source: "USA Today Travel",
    category: "Travel",
    tags: ["travel", "airline", "tourism"],
  },
  {
    url: "https://www.eater.com/rss/index.xml",
    source: "Eater",
    category: "Food",
    tags: ["food", "restaurant", "dining"],
  },
  {
    url: "https://www.foodandwine.com/rss",
    source: "Food & Wine",
    category: "Food",
    tags: ["food", "dining", "recipes"],
  },
  {
    url: "https://www.bonappetit.com/feed/rss",
    source: "Bon Appétit",
    category: "Food",
    tags: ["food", "recipes", "dining"],
  },
  {
    url: "https://www.seriouseats.com/rss",
    source: "Serious Eats",
    category: "Food",
    tags: ["food", "recipes", "restaurant"],
  },
  {
    url: "https://www.restaurantbusinessonline.com/rss.xml",
    source: "Restaurant Business",
    category: "Food",
    tags: ["food", "restaurant", "business"],
  },
  {
    url: "https://www.foodnetwork.com/content/food-com/en/rss/food-network-top-stories.rss",
    source: "Food Network",
    category: "Food",
    tags: ["food", "recipes", "dining"],
  },
  {
    url: "https://www.cnn.com/rss/cnn_latest.rss",
    source: "CNN Food",
    category: "Food",
    tags: ["food", "restaurant", "dining"],
  },
  {
    url: "https://rssfeeds.usatoday.com/usatoday-NewsTopStories",
    source: "USA Today Food",
    category: "Food",
    tags: ["food", "grocery", "restaurant"],
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
  SUPPORTED_LOCAL_CITIES.map((config) => [
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

function normalizeSourceKey(sourceName: string | null | undefined) {
  return (sourceName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSourceFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const hostHaystack = hostname.replace(/^www\./, "");

    const matchedRule = SOURCE_ALIAS_RULES.find((rule) => rule.match.test(hostHaystack));
    return matchedRule?.canonical ?? null;
  } catch {
    return null;
  }
}

function normalizeSourceName(sourceName: string | null | undefined, url?: string | null) {
  const inferredFromUrl = inferSourceFromUrl(url);

  if (inferredFromUrl) {
    return inferredFromUrl;
  }

  const candidate = sourceName?.trim() ?? "";

  if (!candidate) {
    return "News";
  }

  const matchedRule = SOURCE_ALIAS_RULES.find((rule) => rule.match.test(candidate));

  if (matchedRule) {
    return matchedRule.canonical;
  }

  return candidate;
}

function isBlockedFeedArticleCandidate(candidate: {
  source?: string | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
}) {
  const source = candidate.source?.trim() ?? "";
  const url = candidate.url?.trim() ?? "";
  const title = candidate.title?.trim() ?? "";
  const description = candidate.description?.trim() ?? "";
  const haystack = `${source} ${title} ${description} ${url}`;

  return BLOCKED_FEED_SOURCE_PATTERN.test(haystack) || BLOCKED_FEED_URL_PATTERN.test(url);
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
    provider?: string;
  }
): NormalizedArticle | null {
  const title = raw.title?.trim();
  const normalizedUrl = normalizeUrl(raw.url);

  if (!title || !normalizedUrl) {
    return null;
  }

  const rawSourceName =
    raw.source?.name?.trim() ||
    raw.source_name?.trim() ||
    raw.source_id?.trim() ||
    fallback.source;
  const sourceName = normalizeSourceName(rawSourceName, normalizedUrl);
  if (
    isBlockedFeedArticleCandidate({
      source: sourceName,
      url: normalizedUrl,
      title,
      description: raw.description ?? null,
    })
  ) {
    return null;
  }
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
    provider: fallback.provider ?? fallback.source,
  };
}

function hasRealArticleImage(article: Pick<
  NormalizedArticle,
  "urlToImage" | "imageUrl" | "image" | "ogImage" | "mediaContent" | "enclosureUrl" | "twitterImage" | "thumbnail"
>) {
  return Boolean(
    article.urlToImage ||
      article.imageUrl ||
      article.image ||
      article.ogImage ||
      article.mediaContent ||
      article.enclosureUrl ||
      article.twitterImage ||
      article.thumbnail
  );
}

function hasUsablePrimaryImageUrl(imageUrl: string | null | undefined) {
  const trimmed = imageUrl?.trim() ?? "";

  if (!trimmed) {
    return false;
  }

  return !looksLikeLowQualityImageUrl(trimmed);
}

function getPipelineProviderBucket(provider: string | null | undefined) {
  const normalizedProvider = (provider ?? "").trim().toLowerCase();

  if (normalizedProvider === "guardian") {
    return "guardian";
  }

  if (normalizedProvider === "nyt") {
    return "nyt";
  }

  return "current";
}

function getPipelineProviderCounts(articles: NormalizedArticle[]) {
  return articles.reduce(
    (counts, article) => {
      const bucket = getPipelineProviderBucket(article.provider);
      counts[bucket] += 1;
      return counts;
    },
    {
      current: 0,
      guardian: 0,
      nyt: 0,
    }
  );
}

function logProviderArticleStats(providerName: string, articles: NormalizedArticle[]) {
  console.log("NEWS PROVIDER ARTICLE COUNT", {
    provider: providerName,
    count: articles.length,
  });
  console.log("NEWS PROVIDER IMAGE COUNT", {
    provider: providerName,
    count: articles.filter((article) => hasRealArticleImage(article)).length,
  });
}

function getModeCategories(mode: NewsMode, categories: string[]) {
  if (mode === "sports") {
    return ["Sports"];
  }

  if (mode === "celebrity") {
    return ["Celebrity"];
  }

  if (mode === "trump") {
    return ["Politics"];
  }

  if (mode === "weather") {
    return ["Weather"];
  }

  if (mode === "technology") {
    return ["Tech"];
  }

  if (mode === "travel") {
    return ["Travel"];
  }

  if (mode === "food") {
    return ["Food"];
  }

  if (mode === "business") {
    return ["Business", "Finance"];
  }

  if (mode === "myfeed" && categories.length > 0) {
    return categories.slice(0, 5);
  }

  if (categories.length > 0) {
    return categories.slice(0, 5);
  }

  return ["Breaking News", "Politics", "World", "Business", "Tech", "Sports"];
}

function getNytTopStoriesSections(mode: NewsMode, categories: string[]) {
  const sectionMap: Record<string, string[]> = {
    "Breaking News": ["home", "us", "world"],
    Politics: ["politics", "us"],
    World: ["world"],
    Business: ["business"],
    Finance: ["business"],
    Tech: ["technology"],
    Technology: ["technology"],
    Science: ["science"],
    Sports: ["sports"],
    Entertainment: ["arts", "movies", "theater"],
    Celebrity: ["arts", "movies", "theater"],
    Travel: ["travel"],
    Food: ["food"],
    Auto: ["business", "technology"],
    Weather: ["home", "us", "world"],
    Opinion: ["home"],
    Local: ["us"],
    News: ["home"],
  };

  const requestedCategories = getModeCategories(mode, categories);
  const derivedSections = requestedCategories.flatMap(
    (category) => sectionMap[category] ?? ["home"]
  );

  if (mode === "search") {
    derivedSections.unshift("home");
  }

  return Array.from(
    new Set(
      (derivedSections.length > 0 ? derivedSections : ["home", "world", "us"])
        .filter(Boolean)
        .slice(0, 4)
    )
  );
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
      "celebrity news OR celebrity gossip OR entertainment news OR hollywood news OR music celebrity news OR TMZ OR People OR Entertainment Tonight OR Access Hollywood OR Extra OR Deadline OR Entertainment Weekly OR E! News OR Variety OR The Hollywood Reporter OR Page Six OR Us Weekly OR Billboard"
    );
  }

  if (params.mode === "trump") {
    return (
      params.query.trim() ||
      "Donald Trump news OR Trump administration OR Trump latest OR Trump policy OR Trump legal"
    );
  }

  if (params.mode === "weather") {
    const localWeather = params.location.trim() ? ` OR ${params.location.trim()} weather news` : "";
    return (
      params.query.trim() ||
      `weather news OR severe weather OR hurricane news OR tornado news OR climate weather OR winter storm OR flooding news OR The Weather Channel OR AccuWeather OR NOAA OR National Weather Service OR CNN Weather OR Fox Weather${localWeather}`
    );
  }

  if (params.mode === "technology") {
    return (
      params.query.trim() ||
      "technology news OR AI news OR tech startups OR Apple news OR Google news OR Microsoft news OR cybersecurity news OR social media news OR The Verge OR TechCrunch OR Wired OR Ars Technica OR Engadget OR CNET OR CNBC Tech OR Bloomberg Technology"
    );
  }

  if (params.mode === "travel") {
    return (
      params.query.trim() ||
      "travel news OR airline news OR airport news OR cruise news OR tourism news OR travel warning OR travel advisory OR hotel news OR vacation travel news OR Travel + Leisure OR Condé Nast Traveler OR AFAR OR Skift OR The Points Guy OR CNN Travel OR National Geographic Travel OR Lonely Planet OR USA Today Travel"
    );
  }

  if (params.mode === "food") {
    return (
      params.query.trim() ||
      "food news OR restaurant news OR fast food news OR food safety OR grocery news OR recipes news OR dining news OR Eater OR Food & Wine OR Bon Appétit OR Serious Eats OR Restaurant Business OR Food Network OR CNN Food OR USA Today Food"
    );
  }

  if (params.mode === "business") {
    return (
      params.query.trim() ||
      "business news OR finance news OR stock market news OR economy news OR Wall Street news OR CNBC OR Bloomberg OR Reuters Business OR MarketWatch OR Yahoo Finance"
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

function getSourceQualityScore(sourceName: string, url?: string | null) {
  const canonical = normalizeSourceName(sourceName, url);
  const normalized = normalizeSourceKey(canonical);

  for (const rule of SOURCE_QUALITY_RULES) {
    if (rule.match.test(normalized)) {
      return rule.score;
    }
  }

  return 0.68;
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
      const sourceQualityScore = getSourceQualityScore(article.source, article.url);
      const launchScore =
        getLaunchRecencyScore(article) * 0.42 +
        sourceQualityScore * 0.24 +
        getProviderOrderScore(index, articles.length) * 0.16 +
        (1 / sourceCount) * 0.1 +
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
      titleFingerprint ? `title:${titleFingerprint}` : null,
      titleFingerprint ? `title:${sourceKey}:${titleFingerprint}` : null,
      titleFingerprint ? `source-title:${sourceKey}:${titleFingerprint}` : null,
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

function sortImageFirstArticles(articles: NormalizedArticle[]) {
  return [...articles].sort((left, right) => {
    const imageDiff = Number(hasRealArticleImage(right)) - Number(hasRealArticleImage(left));

    if (imageDiff !== 0) {
      return imageDiff;
    }

    const qualityDiff =
      getSourceQualityScore(right.source, right.url) -
      getSourceQualityScore(left.source, left.url);

    if (qualityDiff !== 0) {
      return qualityDiff;
    }

    return getPublishedTime(right) - getPublishedTime(left);
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
  const getImageBoost = (article: NormalizedArticle) => (hasRealArticleImage(article) ? 2.5 : 0);

  if (params.mode === "search" || params.mode === "compare") {
    return [...articles].sort((left, right) => {
      const rightCompositeScore =
        getMatchScore(right, params.query) * 3 +
        getSourceQualityScore(right.source, right.url) * 8 +
        getLaunchRecencyScore(right) * 6 +
        getImageBoost(right);
      const leftCompositeScore =
        getMatchScore(left, params.query) * 3 +
        getSourceQualityScore(left.source, left.url) * 8 +
        getLaunchRecencyScore(left) * 6 +
        getImageBoost(left);
      const scoreDiff = rightCompositeScore - leftCompositeScore;

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
      const rightCompositeScore =
        getLocalMatchScore(right, params.location || params.query, params.cityKey) +
        getSourceQualityScore(right.source, right.url) * 22 +
        getLaunchRecencyScore(right) * 18 +
        getImageBoost(right) * 2;
      const leftCompositeScore =
        getLocalMatchScore(left, params.location || params.query, params.cityKey) +
        getSourceQualityScore(left.source, left.url) * 22 +
        getLaunchRecencyScore(left) * 18 +
        getImageBoost(left) * 2;
      const scoreDiff = rightCompositeScore - leftCompositeScore;

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  if (
    params.mode === "sports" ||
    params.mode === "celebrity" ||
    params.mode === "trump" ||
    params.mode === "weather" ||
    params.mode === "technology" ||
    params.mode === "travel" ||
    params.mode === "food" ||
    params.mode === "business"
  ) {
    return [...articles].sort((left, right) => {
      const effectiveQuery = getEffectiveQuery(params);
      const rightCompositeScore =
        getMatchScore(right, effectiveQuery) * 3 +
        getSourceQualityScore(right.source, right.url) * 8 +
        getLaunchRecencyScore(right) * 6 +
        getImageBoost(right);
      const leftCompositeScore =
        getMatchScore(left, effectiveQuery) * 3 +
        getSourceQualityScore(left.source, left.url) * 8 +
        getLaunchRecencyScore(left) * 6 +
        getImageBoost(left);
      const scoreDiff = rightCompositeScore - leftCompositeScore;

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
      const qualityDiff =
        getSourceQualityScore(right.source, right.url) -
        getSourceQualityScore(left.source, left.url);
      const imageDiff = getImageBoost(right) - getImageBoost(left);
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      if (imageDiff !== 0) {
        return imageDiff;
      }
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return qualityDiff;
    });
  }

  if (params.mode === "myfeed") {
    return diversifyArticles(
      [...articles].sort((left, right) => {
        const rightCompositeScore =
          getPublishedTime(right) +
          getSourceQualityScore(right.source, right.url) * 1000 +
          getImageBoost(right) * 1000;
        const leftCompositeScore =
          getPublishedTime(left) +
          getSourceQualityScore(left.source, left.url) * 1000 +
          getImageBoost(left) * 1000;
        return rightCompositeScore - leftCompositeScore;
      })
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
      params.mode === "celebrity" ||
      params.mode === "trump" ||
      params.mode === "weather" ||
      params.mode === "technology" ||
      params.mode === "travel" ||
      params.mode === "food" ||
      params.mode === "business") &&
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
                : params.mode === "sports" ||
                    params.mode === "celebrity" ||
                    params.mode === "trump" ||
                    params.mode === "weather" ||
                    params.mode === "technology" ||
                    params.mode === "travel" ||
                    params.mode === "food" ||
                    params.mode === "business"
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
              : params.mode === "sports" ||
                  params.mode === "celebrity" ||
                  params.mode === "trump" ||
                  params.mode === "weather" ||
                  params.mode === "technology" ||
                  params.mode === "travel" ||
                  params.mode === "food"
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
  logProviderRequest("NewsAPI", {
    mode: params.mode,
    page: params.page,
    requestCount: requests.length,
    query: getEffectiveQuery(params),
  });
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
            provider: "NewsAPI",
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
  logProviderArticleStats("NewsAPI", normalizedArticles);

  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function fetchGNewsArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  console.log("GNEWS API KEY PRESENT", Boolean(GNEWS_API_KEY));

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
      params.mode === "celebrity" ||
      params.mode === "trump" ||
      params.mode === "weather" ||
      params.mode === "technology" ||
      params.mode === "travel" ||
      params.mode === "food" ||
      params.mode === "business") &&
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

  logProviderRequest("GNews", {
    mode: params.mode,
    page: params.page,
    requestCount: requests.length,
    query: effectiveQuery,
  });

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
          buildNormalizedArticle(
            {
              ...article,
              imageUrl: article.image ?? null,
            },
            {
              source: article.source?.name?.trim() || "GNews",
              category,
              uniqueSeed: `gnews-${category}-${params.page}-${index}`,
              fallbackPublishedOffsetHours: index,
              provider: "gnews",
            }
          )
        )
        .filter((article): article is NormalizedArticle => Boolean(article))
        .filter((article) => hasUsablePrimaryImageUrl(article.imageUrl));
    })
  );

  const normalizedArticles = responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("GNews provider error:", result.reason);
    return [];
  });

  console.log("GNEWS ARTICLE COUNT", normalizedArticles.length);
  console.log(
    "GNEWS IMAGE ARTICLE COUNT",
    normalizedArticles.filter((article) => hasUsablePrimaryImageUrl(article.imageUrl)).length
  );
  logProviderArticleStats("GNews", normalizedArticles);

  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function fetchCurrentsArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  console.log("CURRENTS_API_KEY_PRESENT", Boolean(CURRENTS_API_KEY));

  if (!CURRENTS_API_KEY) {
    logProviderSkip("Currents", "CURRENTS_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const effectiveQuery = getEffectiveQuery(params);
  const searchTerms = effectiveQuery?.trim() || categories.join(" OR ") || "latest news";

  const url = new URL("https://api.currentsapi.services/v1/search");
  url.searchParams.set("keywords", searchTerms);
  url.searchParams.set("language", "en");
  url.searchParams.set("page_number", String(params.page));
  url.searchParams.set("page_size", String(Math.min(params.pageSize, 50)));
  url.searchParams.set("apiKey", CURRENTS_API_KEY);

  logProviderRequest("Currents", {
    mode: params.mode,
    page: params.page,
    query: searchTerms,
  });

  const response = await fetch(url.toString(), {
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    console.error("Currents provider error:", response.status, response.statusText);
    return { articles: [], hasMore: false };
  }

  const data = (await response.json()) as CurrentsApiResponse;
  const normalizedArticles = (data.news ?? [])
    .map((article, index) =>
      buildNormalizedArticle(
        {
          title: article.title ?? null,
          description: article.description ?? null,
          url: article.url ?? null,
          imageUrl: article.image ?? null,
          publishedAt: article.published ?? null,
          source_name: article.author?.trim() || "Currents",
          category: article.category?.[0] ?? categories[0] ?? "News",
        },
        {
          source: article.author?.trim() || "Currents",
          category: article.category?.[0] ?? categories[0] ?? "News",
          uniqueSeed: `currents-${params.page}-${index}-${article.id ?? article.url ?? "item"}`,
          fallbackPublishedOffsetHours: index,
          provider: "currents",
        }
      )
    )
    .filter((article): article is NormalizedArticle => Boolean(article))
    .filter((article) => hasUsablePrimaryImageUrl(article.imageUrl));

  console.log("CURRENTS_ARTICLE_COUNT", normalizedArticles.length);
  console.log(
    "CURRENTS_IMAGE_ARTICLE_COUNT",
    normalizedArticles.filter((article) => hasUsablePrimaryImageUrl(article.imageUrl)).length
  );
  logProviderArticleStats("Currents", normalizedArticles);

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
      params.mode === "celebrity" ||
      params.mode === "trump" ||
      params.mode === "weather" ||
      params.mode === "technology" ||
      params.mode === "travel" ||
      params.mode === "food" ||
      params.mode === "business") &&
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

  logProviderRequest("NewsData.io", {
    mode: params.mode,
    page: params.page,
    query: effectiveQuery || categories[0] || "",
  });

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

  logProviderArticleStats("NewsData.io", normalizedArticles);

  return {
    articles: normalizedArticles,
    hasMore: Boolean(data.nextPage),
  };
}

async function fetchMediaStackArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  if (!MEDIASTACK_API_KEY) {
    logProviderSkip("MediaStack", "MEDIASTACK_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const effectiveQuery = getEffectiveQuery(params);
  const url = new URL("https://api.mediastack.com/v1/news");
  url.searchParams.set("access_key", MEDIASTACK_API_KEY);
  url.searchParams.set("languages", "en");
  url.searchParams.set("countries", "us");
  url.searchParams.set("limit", String(Math.min(params.pageSize, 100)));
  url.searchParams.set("offset", String(Math.max(0, (params.page - 1) * params.pageSize)));

  if (effectiveQuery) {
    url.searchParams.set("keywords", effectiveQuery);
  } else if (categories.length > 0) {
    url.searchParams.set("keywords", getCategoryQuery(categories[0]));
    url.searchParams.set("categories", categories[0].toLowerCase().replace(/\s+/g, ","));
  }

  logProviderRequest("MediaStack", {
    mode: params.mode,
    page: params.page,
    query: effectiveQuery || categories[0] || "",
  });

  const response = await fetch(url.toString(), {
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    console.error("MediaStack provider error:", response.status, response.statusText);
    return { articles: [], hasMore: false };
  }

  const data = (await response.json()) as MediaStackApiResponse;
  const normalizedArticles = (data.data ?? [])
    .map((article, index) =>
      buildNormalizedArticle(
        {
          title: article.title,
          description: article.description,
          url: article.url,
          image: article.image,
          publishedAt: article.published_at,
          source_name: article.source,
          category: article.category,
        },
        {
          source: article.source?.trim() || "MediaStack",
          category: article.category?.trim() || categories[0] || "News",
          uniqueSeed: `mediastack-${params.page}-${index}`,
          fallbackPublishedOffsetHours: index,
          provider: "MediaStack",
        }
      )
    )
    .filter(Boolean) as NormalizedArticle[];

  logProviderArticleStats("MediaStack", normalizedArticles);
  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function fetchGuardianArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  console.log("GUARDIAN API KEY PRESENT", Boolean(GUARDIAN_API_KEY));

  if (!GUARDIAN_API_KEY) {
    logProviderSkip("The Guardian", "GUARDIAN_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const effectiveQuery = getEffectiveQuery(params) || categories[0] || "news";
  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("api-key", GUARDIAN_API_KEY);
  url.searchParams.set("page-size", String(Math.min(params.pageSize, 50)));
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("show-fields", "headline,trailText,thumbnail,bodyText");
  url.searchParams.set("q", effectiveQuery);
  console.log("GUARDIAN REQUEST URL", url.toString().replace(GUARDIAN_API_KEY, "[REDACTED]"));

  logProviderRequest("The Guardian", {
    mode: params.mode,
    page: params.page,
    query: effectiveQuery,
  });

  const response = await fetch(url.toString(), {
    next: { revalidate: 600 },
  });
  console.log("GUARDIAN RESPONSE STATUS", response.status);

  if (!response.ok) {
    console.error("The Guardian provider error:", response.status, response.statusText);
    return { articles: [], hasMore: false };
  }

  const data = (await response.json()) as GuardianApiResponse;
  console.log("GUARDIAN RAW COUNT", data.response?.results?.length ?? 0);
  const normalizedArticles = (data.response?.results ?? [])
    .map((article, index) => {
      const imageUrl = article.fields?.thumbnail ?? null;

      if (!imageUrl) {
        console.log("PROVIDER ARTICLE REJECTED REASON", {
          provider: "guardian",
          reason: "missing_thumbnail",
          title: article.fields?.headline ?? article.webTitle ?? null,
          url: article.webUrl ?? null,
        });
        return null;
      }

      if (looksLikeLowQualityImageUrl(imageUrl)) {
        console.log("PROVIDER ARTICLE REJECTED REASON", {
          provider: "guardian",
          reason: "low_quality_thumbnail",
          title: article.fields?.headline ?? article.webTitle ?? null,
          url: article.webUrl ?? null,
          imageUrl,
        });
        return null;
      }

      return buildNormalizedArticle(
        {
          title: article.fields?.headline ?? article.webTitle,
          description: article.fields?.trailText ?? null,
          content: article.fields?.bodyText ?? null,
          url: article.webUrl,
          imageUrl,
          publishedAt: article.webPublicationDate,
          source_name: "The Guardian",
          category: article.sectionName ?? categories[0] ?? "News",
        },
        {
          source: "The Guardian",
          category: article.sectionName ?? categories[0] ?? "News",
          uniqueSeed: `guardian-${params.page}-${index}`,
          fallbackPublishedOffsetHours: index,
          provider: "guardian",
        }
      );
    })
    .filter(Boolean) as NormalizedArticle[];

  console.log("GUARDIAN ARTICLE COUNT", normalizedArticles.length);
  console.log(
    "GUARDIAN IMAGE COUNT",
    normalizedArticles.filter((article) => hasRealArticleImage(article)).length
  );
  logProviderArticleStats("The Guardian", normalizedArticles);
  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
  };
}

async function fetchNytArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  console.log("NYT API KEY PRESENT", Boolean(NYT_API_KEY));

  if (!NYT_API_KEY) {
    logProviderSkip("New York Times", "NYT_API_KEY is missing");
    return { articles: [], hasMore: false };
  }

  const categories = getModeCategories(params.mode, params.categories);
  const sections = getNytTopStoriesSections(params.mode, params.categories);

  logProviderRequest("New York Times", {
    mode: params.mode,
    page: params.page,
    sections,
  });

  const sectionResponses = await Promise.allSettled(
    sections.map(async (section) => {
      const url = new URL(`https://api.nytimes.com/svc/topstories/v2/${section}.json`);
      url.searchParams.set("api-key", NYT_API_KEY);
      console.log("NYT REQUEST URL", url.toString().replace(NYT_API_KEY, "[REDACTED]"));

      const response = await fetch(url.toString(), {
        next: { revalidate: 600 },
      });
      console.log("NYT RESPONSE STATUS", response.status);

      if (!response.ok) {
        throw new Error(`New York Times ${section} failed (${response.status})`);
      }

      const payload = (await response.json()) as NytTopStoriesResponse;
      console.log("NYT RAW COUNT", payload.results?.length ?? 0);
      return { section, results: payload.results ?? [] };
    })
  );

  const normalizedArticles = sectionResponses
    .flatMap((result) => (result.status === "fulfilled" ? result.value.results : []))
    .map((article, index) => {
      const largestImage =
        [...(article.multimedia ?? [])]
          .filter((item) => Boolean(item.url))
          .sort((left, right) => (Number(right.width ?? 0) * Number(right.height ?? 0)) - (Number(left.width ?? 0) * Number(left.height ?? 0)))[0] ?? null;
      const largestImageUrl = largestImage?.url?.trim() ?? null;
      const fullImageUrl = largestImageUrl
        ? largestImageUrl.startsWith("http")
          ? largestImageUrl
          : `https://static01.nyt.com/${largestImageUrl.replace(/^\/+/, "")}`
        : null;

      if (!fullImageUrl) {
        console.log("PROVIDER ARTICLE REJECTED REASON", {
          provider: "nyt",
          reason: "missing_multimedia_image",
          title: article.title ?? null,
          url: article.url ?? null,
        });
        return null;
      }

      if (looksLikeLowQualityImageUrl(fullImageUrl)) {
        console.log("PROVIDER ARTICLE REJECTED REASON", {
          provider: "nyt",
          reason: "low_quality_multimedia_image",
          title: article.title ?? null,
          url: article.url ?? null,
          imageUrl: fullImageUrl,
        });
        return null;
      }

      return buildNormalizedArticle(
        {
          title: article.title ?? null,
          description: article.abstract ?? null,
          url: article.url ?? null,
          imageUrl: fullImageUrl,
          publishedAt: article.published_date ?? null,
          source_name: "The New York Times",
          category: article.section ?? article.subsection ?? categories[0] ?? "News",
        },
        {
          source: "The New York Times",
          category: article.section ?? article.subsection ?? categories[0] ?? "News",
          uniqueSeed: `nyt-topstories-${params.page}-${index}`,
          fallbackPublishedOffsetHours: index,
          provider: "nyt",
        }
      );
    })
    .filter((article) => Boolean(article && hasRealArticleImage(article))) as NormalizedArticle[];

  console.log("NYT IMAGE COUNT", normalizedArticles.length);

  logProviderArticleStats("New York Times", normalizedArticles);
  return {
    articles: normalizedArticles,
    hasMore: normalizedArticles.length >= params.pageSize,
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
          source_name: stripHtml(extractXmlTag(block, "source")) || fallbackFeed.source,
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
      params.mode === "celebrity" ||
      params.mode === "trump" ||
      params.mode === "weather" ||
      params.mode === "technology" ||
      params.mode === "travel" ||
      params.mode === "food" ||
      params.mode === "business") &&
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
      : params.mode === "business"
      ? 10
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

function buildGoogleNewsRssUrl(query: string) {
  const url = new URL(`${GOOGLE_NEWS_RSS_BASE}/search`);
  url.searchParams.set("q", `${query} when:7d`);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  return url.toString();
}

function buildGoogleNewsRssFeeds(params: ProviderFetchParams): RssFeedConfig[] {
  const effectiveQuery = getEffectiveQuery(params);
  const queryTerms = effectiveQuery
    ? effectiveQuery
        .split("|")
        .map((query) => query.trim())
        .filter(Boolean)
    : getModeCategories(params.mode, params.categories).map((category) => getCategoryQuery(category));

  return Array.from(new Set(queryTerms))
    .slice(
      0,
      params.mode === "compare"
        ? 8
        : params.mode === "local" || params.mode === "sports"
          ? 6
          : 4
    )
    .map((query) => ({
      url: buildGoogleNewsRssUrl(query),
      source: "Google News",
      category:
        params.mode === "search" || params.mode === "compare"
          ? "Search"
          : getModeCategories(params.mode, params.categories)[0] ?? "News",
      tags: query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2),
    }));
}

async function fetchGoogleNewsRssArticles(params: ProviderFetchParams): Promise<ProviderResponse> {
  const feeds = buildGoogleNewsRssFeeds(params);
  let articles = await fetchRssFeedSet(feeds, feeds.length);

  if ((params.mode === "search" || params.mode === "compare") && params.query.trim()) {
    articles = articles.filter((article) => getMatchScore(article, params.query) > 0);
  }

  if (params.mode === "local") {
    const locationQuery = params.location || params.query;
    articles = articles.filter((article) =>
      isQualifiedLocalArticle(article, locationQuery, params.cityKey)
    );
  }

  articles.sort((left, right) => getPublishedTime(right) - getPublishedTime(left));

  const start = (params.page - 1) * params.pageSize;
  const sliced = articles.slice(start, start + params.pageSize);

  return {
    articles: sliced,
    hasMore: articles.length > start + params.pageSize,
  };
}

async function fetchLocalArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const localCity = getLocalCityConfigByKey(params.cityKey);

  console.log("LOCAL CITY KEY", params.cityKey ?? null);
  console.log("LOCAL CONFIG FOUND", Boolean(localCity), localCity?.displayName ?? null);

  if (!localCity) {
    console.error("LOCAL CONFIG MISSING", {
      cityKey: params.cityKey ?? null,
      city: params.city ?? null,
      state: params.state ?? null,
      location: params.location ?? null,
    });
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
  console.log("LOCAL CITY SELECTED", localCity.cityKey);
  console.log("LOCAL QUERIES", localCity.searchQueries);
  console.log("LOCAL QUERIES USED", localCity.searchQueries);

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
        fetchGoogleNewsRssArticles({
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
      fetchGoogleNewsRssArticles({
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
  const finalArticles = filteredArticles.slice(0, params.pageSize);

  console.log(
    "LOCAL FINAL SOURCES",
    finalArticles.map((article) => article.sourceName || article.source)
  );
  console.log("LOCAL FINAL COUNT", finalArticles.length);

  return {
    articles: finalArticles,
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
        fetchGoogleNewsRssArticles({ ...params, mode: "search", query }),
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
      : "sports|nfl|nba|mlb|nhl|mls|soccer|mma|ufc|golf|nascar|formula|wnba|college",
    "i"
  );
  const sportsArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const text = `${article.title} ${article.description ?? ""} ${article.category}`.toLowerCase();
    return (
      article.category.toLowerCase() === "sports" ||
      SPORTS_RSS_SOURCES.some((name) => source.includes(name.toLowerCase())) ||
      /the athletic|sports illustrated|sportscenter|bbc sport|mma fighting|mlb\.com|nba\.com|nfl\.com|nhl\.com/.test(source) ||
      /(nfl|nba|mlb|nhl|mls|mma|ufc|soccer|golf|nascar|formula|playoff|season|league|coach|draft|wnba|college)/.test(
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
    /(celebrity|celebrities|gossip|hollywood|entertainment|music|tmz|people|entertainment tonight|access hollywood|extra|deadline|ew|e!\s*news|variety|hollywood reporter|page six|us weekly|billboard|red carpet|actor|actress|singer|movie star|tv star)/i;
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

async function fetchTrumpArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const trumpFeeds = RSS_FEEDS.filter((feed) =>
    TRUMP_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(trumpFeeds, trumpFeeds.length);
  const effectiveQueries = Array.from(new Set([...TRUMP_QUERY_TERMS, ...TRUMP_SOURCE_NAMES]));
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
  const trumpPattern =
    /(donald trump|trump administration|trump latest|trump policy|trump legal|trump economy|trump immigration|trump tariffs|white house|maga)/i;
  const trumpArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const text = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
    return trumpPattern.test(text) || TRUMP_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase()));
  });

  return {
    articles: trumpArticles.slice(0, params.pageSize),
    nextPage: trumpArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: trumpArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchWeatherArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const weatherFeeds = RSS_FEEDS.filter((feed) =>
    WEATHER_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(weatherFeeds, weatherFeeds.length);
  const effectiveQueries = Array.from(
    new Set([
      ...WEATHER_QUERY_TERMS,
      ...WEATHER_SOURCE_NAMES,
      ...(params.location.trim()
        ? [`${params.location.trim()} weather news`, `${params.location.trim()} severe weather`]
        : []),
    ])
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
  const categoryQueries = params.query.trim()
    ? params.query
        .split("|")
        .map((query) => query.trim())
        .filter(Boolean)
    : [];
  const weatherPattern =
    /(weather|severe weather|hurricane|tornado|climate weather|winter storm|flooding|wildfire weather|forecast|accuweather|noaa|national weather service|cnn weather|fox weather|the weather channel|ap news|storm|alert)/i;
  const categoryPattern = new RegExp(
    categoryQueries.length > 0
      ? categoryQueries
          .flatMap((query) => query.toLowerCase().split(/[^a-z0-9]+/i))
          .filter((term) => term.length > 2)
          .join("|")
      : "weather|storm|hurricane|tornado|flooding|wildfire|forecast|alert|climate",
    "i"
  );
  const weatherArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
    return (
      (weatherPattern.test(haystack) ||
        WEATHER_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase()))) &&
      categoryPattern.test(haystack)
    );
  });

  return {
    articles: weatherArticles.slice(0, params.pageSize),
    nextPage: weatherArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: weatherArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchFoodArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const foodFeeds = RSS_FEEDS.filter((feed) =>
    FOOD_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(foodFeeds, foodFeeds.length);
  const effectiveQueries = Array.from(new Set([...FOOD_QUERY_TERMS, ...FOOD_SOURCE_NAMES]));
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
  const foodPattern =
    /(food|restaurant|fast food|food safety|grocery|recipes|dining|chef|menu|eater|food network|bon appétit|serious eats|nyt cooking|taste of home|allrecipes|delish|epicurious|saveur|food & wine)/i;
  const foodArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`;
    return (
      foodPattern.test(haystack) ||
      FOOD_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase()))
    );
  });

  return {
    articles: foodArticles.slice(0, params.pageSize),
    nextPage: foodArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: foodArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchTravelArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const travelFeeds = RSS_FEEDS.filter((feed) =>
    TRAVEL_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(travelFeeds, travelFeeds.length);
  const effectiveQueries = Array.from(new Set([...TRAVEL_QUERY_TERMS, ...TRAVEL_SOURCE_NAMES]));
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
  const travelPattern =
    /(travel|airline|airport|cruise|tourism|travel warning|travel advisory|hotel|vacation|destination|flight|trip|passport|tsa|lonely planet|skift|points guy)/i;
  const travelArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`;
    return (
      travelPattern.test(haystack) ||
      TRAVEL_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase()))
    );
  });

  return {
    articles: travelArticles.slice(0, params.pageSize),
    nextPage: travelArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: travelArticles.length > params.pageSize,
    page: params.page,
    pageSize: params.pageSize,
  };
}

async function fetchTechnologyArticles(params: ProviderFetchParams): Promise<NewsRouteResponse> {
  const technologyFeeds = RSS_FEEDS.filter((feed) =>
    TECHNOLOGY_SOURCE_NAMES.some((source) => feed.source.toLowerCase() === source.toLowerCase())
  );
  const rssArticles = await fetchRssFeedSet(technologyFeeds, technologyFeeds.length);
  const effectiveQueries = Array.from(new Set([...TECHNOLOGY_QUERY_TERMS]));
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
  const technologyPattern =
    /(technology|ai|artificial intelligence|startup|apple|google|microsoft|cybersecurity|social media|the verge|techcrunch|wired|ars technica|engadget|cnet|cnbc tech|bloomberg technology)/i;
  const technologyArticles = sortArticlesForMode(combined, params).filter((article) => {
    const source = article.source.toLowerCase();
    const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`;
    return (
      technologyPattern.test(haystack) ||
      TECHNOLOGY_SOURCE_NAMES.some((name) => source.includes(name.toLowerCase()))
    );
  });

  return {
    articles: technologyArticles.slice(0, params.pageSize),
    nextPage: technologyArticles.length > params.pageSize ? params.page + 1 : null,
    hasMore: technologyArticles.length > params.pageSize,
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

  if (params.mode === "trump") {
    return fetchTrumpArticles(params);
  }

  if (params.mode === "weather") {
    return fetchWeatherArticles(params);
  }

  if (params.mode === "technology") {
    return fetchTechnologyArticles(params);
  }

  if (params.mode === "travel") {
    return fetchTravelArticles(params);
  }

  if (params.mode === "food") {
    return fetchFoodArticles(params);
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
    { name: "Currents", run: () => fetchCurrentsArticles(params) },
    { name: "MediaStack", run: () => fetchMediaStackArticles(params) },
    { name: "The Guardian", run: () => fetchGuardianArticles(params) },
    { name: "New York Times", run: () => fetchNytArticles(params) },
    { name: "Google News RSS", run: () => fetchGoogleNewsRssArticles(params) },
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
      currents: Boolean(CURRENTS_API_KEY),
      mediaStack: Boolean(MEDIASTACK_API_KEY),
      nyt: Boolean(NYT_API_KEY),
      guardian: Boolean(GUARDIAN_API_KEY),
      bingNews: Boolean(BING_NEWS_API_KEY),
      googleNewsRss: true,
      newsData: Boolean(NEWSDATA_API_KEY),
      rss: true,
      sportsApi: Boolean(SPORTS_API_KEY),
      apiSports: Boolean(API_SPORTS_KEY),
      sportsData: Boolean(SPORTSDATA_API_KEY),
      mediastack: Boolean(MEDIASTACK_API_KEY),
    },
    providers: providerDiagnostics,
  });

  const combined = providerResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value.articles : []
  );
  const combinedProviderCounts = getPipelineProviderCounts(combined);
  console.log("MAIN PIPELINE CURRENT COUNT", combinedProviderCounts.current);
  console.log("MAIN PIPELINE GUARDIAN COUNT", combinedProviderCounts.guardian);
  console.log("MAIN PIPELINE NYT COUNT", combinedProviderCounts.nyt);
  console.log("MAIN PIPELINE MERGED COUNT", combined.length);
  console.log("NEWS MERGED COUNT", combined.length);
  console.log(
    "NEWS MERGED IMAGE_ONLY COUNT",
    combined.filter((article) => hasRealArticleImage(article)).length
  );
  console.log("RAW PROVIDER COUNT", combined.length);

  const deduped = dedupeArticles(combined);
  console.log("NEWS DEDUPED COUNT", deduped.length);
  const sorted = sortArticlesForMode(deduped, params);
  const imageFirstSorted = sortImageFirstArticles(sorted);
  const afterImageFilter = imageFirstSorted.filter((article) => hasRealArticleImage(article));
  console.log("MAIN PIPELINE AFTER IMAGE FILTER COUNT", afterImageFilter.length);
  const afterSourceFilter = afterImageFilter;
  console.log("MAIN PIPELINE AFTER SOURCE FILTER COUNT", afterSourceFilter.length);
  console.log(
    "NEWS IMAGE_FIRST COUNT",
    imageFirstSorted.filter((article) => hasRealArticleImage(article)).length
  );
  const realArticles = afterSourceFilter.filter((article) => !isFallbackArticle(article));
  const enrichedRealArticles =
    params.mode === "trending" && params.page === 1
      ? await enrichTrendingArticleImages(realArticles)
      : realArticles;
  const finalRealArticles =
    params.mode === "trending" ? balanceTrendingArticles(enrichedRealArticles) : enrichedRealArticles;
  console.log("MAIN PIPELINE FINAL RENDER COUNT", finalRealArticles.length);
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
    value === "trump" ||
    value === "weather" ||
    value === "technology" ||
    value === "travel" ||
    value === "food" ||
    value === "business" ||
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
