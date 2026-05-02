type NewsApiArticle = {
  content?: string | null;
  description?: string | null;
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

export async function GET() {
  const responses = await Promise.allSettled(
    NEWS_QUERY_CONFIGS.map(async (query) => {
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

      return {
        id: hashArticleId(articleKey),
        title: article.title,
        source: sourceName,
        category,
        time: "Recent",
        image: article.urlToImage,
        description: article.description,
        url: normalizedUrl || article.url,
        publishedAt: article.publishedAt,
        content: article.content,
        likes: popularity.likes,
        comments: new Array(popularity.commentCount).fill(null),
      };
    })
  );

  return Response.json(articles.slice(0, 60));
}
