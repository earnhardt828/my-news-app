type NewsApiArticle = {
  content?: string | null;
  description?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  title: string;
  url?: string | null;
  urlToImage?: string | null;
  source: {
    name: string;
  };
};

type NewsQueryConfig = {
  url: string;
  category: string;
};

type ApiArticle = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  likes: number;
  comments: null[];
};

type FallbackSeed = {
  title: string;
  source: string;
  category: string;
  description: string;
};

const NEWS_API_KEY = "200bc3d2913541a6a40bbfc887d1d5f1";

const NEWS_QUERY_CONFIGS: NewsQueryConfig[] = [
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&pageSize=14",
    category: "Breaking News",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=8",
    category: "Business",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=technology&pageSize=8",
    category: "Tech",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=sports&pageSize=7",
    category: "Sports",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=health&pageSize=6",
    category: "Health",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=science&pageSize=6",
    category: "Science",
  },
  {
    url: "https://newsapi.org/v2/top-headlines?country=us&category=entertainment&pageSize=6",
    category: "Entertainment",
  },
  {
    url: "https://newsapi.org/v2/everything?q=politics%20OR%20election%20OR%20congress&language=en&sortBy=publishedAt&pageSize=7",
    category: "Politics",
  },
  {
    url: "https://newsapi.org/v2/everything?q=world%20OR%20international%20OR%20global&language=en&sortBy=publishedAt&pageSize=7",
    category: "World",
  },
  {
    url: "https://newsapi.org/v2/everything?q=finance%20OR%20markets%20OR%20wall%20street&language=en&sortBy=publishedAt&pageSize=6",
    category: "Finance",
  },
  {
    url: "https://newsapi.org/v2/everything?q=%22local%20news%22%20OR%20community%20OR%20city&language=en&sortBy=publishedAt&pageSize=6",
    category: "Local News",
  },
];

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const FALLBACK_ARTICLE_SEEDS: FallbackSeed[] = [
  {
    title: "Congress returns with a packed agenda on budget, border, and aid talks",
    source: "Associated Press",
    category: "Politics",
    description: "Lawmakers head back to Washington facing another week of negotiations on domestic priorities and international funding.",
  },
  {
    title: "Wall Street watches bond yields, oil prices, and earnings for fresh signals",
    source: "Reuters",
    category: "Finance",
    description: "Investors are tracking rates, commodities, and corporate outlooks as markets look for direction.",
  },
  {
    title: "Tech companies push new AI features while regulators weigh guardrails",
    source: "Bloomberg",
    category: "Tech",
    description: "The latest product rollouts arrive alongside policy questions about safety, transparency, and competition.",
  },
  {
    title: "Health agencies monitor spring outbreak trends and hospital capacity",
    source: "NBC News",
    category: "Health",
    description: "Officials say vaccination, testing, and local hospital readiness remain key factors in the weeks ahead.",
  },
  {
    title: "Scientists unveil climate data showing rapid change across coastal regions",
    source: "BBC News",
    category: "Science",
    description: "Researchers say updated measurements highlight growing pressure on infrastructure and ecosystems.",
  },
  {
    title: "Major league contenders reshuffle rotations as the season intensifies",
    source: "ESPN",
    category: "Sports",
    description: "Teams are adjusting lineups and workloads as injuries and standings start to shape strategy.",
  },
  {
    title: "Studios bet on franchise releases and streaming bundles to drive summer demand",
    source: "The Guardian",
    category: "Entertainment",
    description: "Media companies are balancing box office plans with subscription growth and advertising goals.",
  },
  {
    title: "Local transit, housing, and school funding top city hall debates nationwide",
    source: "Axios",
    category: "Local News",
    description: "Mayors and councils are weighing service cuts, tax choices, and long-term infrastructure needs.",
  },
  {
    title: "Global leaders renew ceasefire pressure as humanitarian corridors remain fragile",
    source: "Al Jazeera",
    category: "World",
    description: "Diplomatic efforts continue as aid groups warn that access and supply routes remain uncertain.",
  },
  {
    title: "Retail spending data offers mixed picture for consumer confidence this month",
    source: "CBS News",
    category: "Business",
    description: "Analysts say shoppers are still spending selectively as prices and borrowing costs stay elevated.",
  },
  {
    title: "Federal agencies expand weather alerts ahead of another severe storm stretch",
    source: "CNN",
    category: "Weather",
    description: "Emergency managers are asking residents to monitor warnings closely as storms move across multiple regions.",
  },
  {
    title: "Universities face renewed debate over tuition, aid, and campus speech rules",
    source: "Washington Post",
    category: "Education",
    description: "Administrators and students are grappling with affordability and policy changes before the next term.",
  },
];

function hashArticleId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
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
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word))
    .slice(0, 12)
    .join(" ");
}

function deterministicPopularitySeed(input: string) {
  const seed = hashArticleId(input);
  const likes = 18 + (seed % 83);
  const commentCount = (Math.floor(seed / 13) % 21) + 2;
  return { likes, commentCount };
}

function getNormalizedArticleImage(article: {
  urlToImage?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}) {
  return article.urlToImage || article.image || article.imageUrl || null;
}

function buildFallbackArticles(page: number, pageSize: number) {
  const repeatedSeeds = Array.from({ length: 4 }, (_, cycleIndex) =>
    FALLBACK_ARTICLE_SEEDS.map((seed, seedIndex) => {
      const articleKey = `${seed.title}-${seed.source}-${cycleIndex}-${seedIndex}`;
      const popularity = deterministicPopularitySeed(articleKey);
      const publishedAt = new Date(
        Date.now() - (cycleIndex * FALLBACK_ARTICLE_SEEDS.length + seedIndex) * 90 * 60 * 1000
      ).toISOString();

      return {
        id: hashArticleId(articleKey),
        title:
          cycleIndex === 0 ? seed.title : `${seed.title} Live updates ${cycleIndex + 1}`,
        source: seed.source,
        category: seed.category,
        time: "Recent",
        image: null,
        imageUrl: null,
        urlToImage: null,
        description: seed.description,
        url: `https://graffiti.app/fallback/${hashArticleId(articleKey)}`,
        publishedAt,
        content: seed.description,
        likes: popularity.likes,
        comments: new Array(popularity.commentCount).fill(null),
      } satisfies ApiArticle;
    })
  ).flat();

  const startIndex = Math.max(0, (page - 1) * pageSize);
  return repeatedSeeds.slice(startIndex, startIndex + pageSize);
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

function withRequestPagination(url: string, page: number, pageSize?: number) {
  const parsed = new URL(url);
  parsed.searchParams.set("page", String(Math.max(1, page)));

  if (pageSize) {
    parsed.searchParams.set("pageSize", String(Math.min(100, Math.max(1, pageSize))));
  }

  return parsed.toString();
}

function buildHomeQueries(page: number) {
  return NEWS_QUERY_CONFIGS.map((query) => ({
    ...query,
    url: withRequestPagination(query.url, page),
  }));
}

async function fetchNewsQueryBatch(queries: NewsQueryConfig[]): Promise<ApiArticle[]> {
  const responses = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await fetch(query.url, {
        headers: {
          Authorization: NEWS_API_KEY,
        },
        next: { revalidate: 900 },
      });

      if (!response.ok) {
        throw new Error(`News API request failed for ${query.category}`);
      }

      const data = (await response.json()) as { articles?: NewsApiArticle[] };
      return (data.articles ?? []).map((article, index) => ({
        article,
        category: query.category,
        queryIndex: index,
      }));
    })
  );

  const sourceArticles = responses.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("News fetch failed:", result.reason);
    return [];
  });

  const seenUrls = new Set<string>();
  const seenTitleFingerprints = new Set<string>();

  const dedupedArticles = sourceArticles.filter(({ article }) => {
    const normalizedUrl = normalizeUrl(article.url);
    const titleFingerprint = buildTitleFingerprint(article.title);

    if (normalizedUrl && seenUrls.has(normalizedUrl)) {
      return false;
    }

    if (titleFingerprint && seenTitleFingerprints.has(titleFingerprint)) {
      return false;
    }

    if (normalizedUrl) {
      seenUrls.add(normalizedUrl);
    }

    if (titleFingerprint) {
      seenTitleFingerprints.add(titleFingerprint);
    }

    return true;
  });

  const articles = diversifyArticles(
    dedupedArticles.map(({ article, category, queryIndex }) => {
      const normalizedUrl = normalizeUrl(article.url);
      const sourceName = article.source?.name ?? "Unknown";
      const articleKey =
        normalizedUrl || `${article.title}-${sourceName}-${category}-${queryIndex}`;
      const popularity = deterministicPopularitySeed(articleKey);
      const normalizedImage = getNormalizedArticleImage(article);

      return {
        id: hashArticleId(articleKey),
        title: article.title,
        source: sourceName,
        category,
        time: "Recent",
        image: normalizedImage,
        imageUrl: normalizedImage,
        urlToImage: normalizedImage,
        description: article.description,
        url: normalizedUrl || article.url,
        publishedAt: article.publishedAt,
        content: article.content,
        likes: popularity.likes,
        comments: new Array(popularity.commentCount).fill(null),
      };
    })
  );

  return articles;
}

function buildSearchQueries(rawQuery: string, page: number, pageSize: number) {
  const query = rawQuery.trim();
  const encodedQuery = encodeURIComponent(query);
  const exactPhrase = encodeURIComponent(`"${query}"`);
  const queryWords = query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
  const tokenQuery = encodeURIComponent(queryWords.join(" AND "));
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneHundredEightyDaysAgo = new Date(
    Date.now() - 180 * 24 * 60 * 60 * 1000
  ).toISOString();

  return [
    {
      url: withRequestPagination(
        `https://newsapi.org/v2/everything?q=${exactPhrase}&language=en&sortBy=publishedAt&from=${encodeURIComponent(thirtyDaysAgo)}`,
        page,
        Math.max(20, Math.min(40, pageSize))
      ),
      category: "Search",
    },
    {
      url: withRequestPagination(
        `https://newsapi.org/v2/everything?q=${encodedQuery}&language=en&sortBy=publishedAt&from=${encodeURIComponent(thirtyDaysAgo)}`,
        page,
        Math.max(24, Math.min(50, pageSize + 10))
      ),
      category: "Search",
    },
    {
      url: withRequestPagination(
        `https://newsapi.org/v2/everything?q=${tokenQuery || encodedQuery}&language=en&sortBy=publishedAt&from=${encodeURIComponent(oneHundredEightyDaysAgo)}`,
        page,
        Math.max(18, Math.min(40, pageSize))
      ),
      category: "Search",
    },
  ] satisfies NewsQueryConfig[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    30,
    Math.max(1, Number(searchParams.get("pageSize") ?? "30") || 30)
  );
  const isPaginatedRequest =
    Boolean(query) || searchParams.has("page") || searchParams.has("pageSize");

  if (query) {
    const searchArticles = await fetchNewsQueryBatch(buildSearchQueries(query, page, pageSize));
    const sortedSearchArticles = searchArticles.sort((left, right) => {
        const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
        const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
        return rightTime - leftTime;
      });

    return Response.json({
      articles: sortedSearchArticles.slice(0, pageSize),
      page,
      pageSize,
      hasMore: sortedSearchArticles.length >= pageSize,
    });
  }

  const articles = await fetchNewsQueryBatch(
    isPaginatedRequest ? buildHomeQueries(page) : NEWS_QUERY_CONFIGS
  );
  const fallbackArticles =
    articles.length === 0 ? buildFallbackArticles(page, pageSize) : articles.slice(0, pageSize);

  if (articles.length === 0) {
    console.error(
      "News feed returned zero live articles. Serving fallback stories instead.",
      { page, pageSize, query: null }
    );
  }

  if (isPaginatedRequest) {
    return Response.json({
      articles: fallbackArticles,
      page,
      pageSize,
      hasMore: articles.length === 0 ? fallbackArticles.length >= pageSize : articles.length >= pageSize,
    });
  }

  return Response.json(
    articles.length === 0 ? buildFallbackArticles(1, 30) : articles.slice(0, 60)
  );
}
