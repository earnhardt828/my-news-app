import "server-only";

export type NytProviderArticle = {
  title: string | null;
  description: string | null;
  url: string | null;
  source: "The New York Times";
  publishedAt: string | null;
  imageUrl: string | null;
  category: string | null;
  provider: "nyt";
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
    }> | null;
  }>;
};

type NytMultimediaItem = {
  url?: string | null;
  width?: number | null;
  height?: number | null;
};

export type NytTopStoriesResult = {
  keyPresent: boolean;
  keyLength: number;
  requestUrl: string | null;
  status: number | null;
  rawCount: number;
  imageCount: number;
  firstTitle: string | null;
  firstImage: string | null;
  error: string | null;
  articles: NytProviderArticle[];
};

function getLargestNytImageUrl(multimedia?: NytMultimediaItem[] | null) {
  const largestImage =
    [...(multimedia ?? [])]
      .filter((item) => Boolean(item?.url))
      .sort(
        (left, right) =>
          Number(right?.width ?? 0) * Number(right?.height ?? 0) -
          Number(left?.width ?? 0) * Number(left?.height ?? 0)
      )[0] ?? null;

  const largestImageUrl = largestImage?.url?.trim() ?? null;
  return largestImageUrl
    ? largestImageUrl.startsWith("http")
      ? largestImageUrl
      : `https://static01.nyt.com/${largestImageUrl.replace(/^\/+/, "")}`
    : null;
}

export async function fetchNytTopStories(
  sections: string[] = ["home"]
): Promise<NytTopStoriesResult> {
  const nytKey = process.env.NYT_API_KEY ?? "";
  const uniqueSections = Array.from(new Set(sections.filter(Boolean)));
  const firstSection = uniqueSections[0] ?? "home";
  const keyLength = nytKey?.length || 0;

  if (!nytKey) {
    const missingUrl = new URL(`https://api.nytimes.com/svc/topstories/v2/${firstSection}.json`);
    missingUrl.searchParams.set("api-key", nytKey);
    return {
      keyPresent: false,
      keyLength,
      requestUrl: missingUrl.toString().replace("api-key=", "api-key=[MISSING]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: "Provider skipped: missing key",
      articles: [],
    };
  }

  let lastStatus: number | null = null;
  let firstRequestUrl: string | null = null;

  try {
    const sectionResponses = await Promise.allSettled(
      uniqueSections.map(async (section) => {
        const url = new URL(`https://api.nytimes.com/svc/topstories/v2/${section}.json`);
        url.searchParams.set("api-key", nytKey);
        if (!firstRequestUrl) {
          firstRequestUrl = url.toString().replace(nytKey, "[REDACTED]");
        }

        const response = await fetch(url.toString(), {
          next: { revalidate: 60 },
        });
        lastStatus = response.status;

        if (!response.ok) {
          throw new Error(`NYT ${section} request failed (${response.status})`);
        }

        const payload = (await response.json()) as NytTopStoriesResponse;
        return payload.results ?? [];
      })
    );

    const rawItems = sectionResponses.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    const mappedArticles: Array<NytProviderArticle | null> = rawItems
      .map((article) => {
        const imageUrl = getLargestNytImageUrl(article.multimedia);
        if (!imageUrl) {
          return null;
        }

        return {
          title: article.title ?? null,
          description: article.abstract ?? null,
          url: article.url ?? null,
          source: "The New York Times",
          publishedAt: article.published_date ?? null,
          imageUrl,
          category: article.section ?? article.subsection ?? "News",
          provider: "nyt",
        };
      });

    const articles: NytProviderArticle[] = mappedArticles
      .filter(
        (article): article is NytProviderArticle =>
          Boolean(article && article.title && article.url && article.imageUrl)
      );

    return {
      keyPresent: true,
      keyLength,
      requestUrl: firstRequestUrl,
      status: lastStatus,
      rawCount: rawItems.length,
      imageCount: articles.length,
      firstTitle: articles[0]?.title ?? null,
      firstImage: articles[0]?.imageUrl ?? null,
      error: null,
      articles,
    };
  } catch (error) {
    return {
      keyPresent: true,
      keyLength,
      requestUrl: firstRequestUrl,
      status: lastStatus,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
      articles: [],
    };
  }
}
