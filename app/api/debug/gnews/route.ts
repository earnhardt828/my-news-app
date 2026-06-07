export const dynamic = "force-dynamic";
export const revalidate = 0;

type GNewsDebugResponse = {
  articles?: Array<{
    title?: string | null;
    image?: string | null;
    source?: {
      name?: string | null;
    } | null;
  }>;
};

function hasUsableImage(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  const normalized = url.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /^https?:\/\//.test(normalized);
}

export async function GET() {
  const gnewsKey = process.env.GNEWS_API_KEY ?? "";
  const keyPresent = Boolean(gnewsKey);
  const keyLength = gnewsKey.length;
  const requestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${
    keyPresent ? "[REDACTED]" : "[MISSING]"
  }`;

  if (!keyPresent) {
    return Response.json({
      keyPresent: false,
      keyLength,
      requestUrl,
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: "Provider skipped: missing key",
    });
  }

  try {
    const liveUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${gnewsKey}`;

    const response = await fetch(liveUrl, {
      next: { revalidate: 0 },
    });

    const status = response.status;

    if (!response.ok) {
      return Response.json({
        keyPresent: true,
        keyLength,
        requestUrl,
        status,
        rawCount: 0,
        imageCount: 0,
        firstTitle: null,
        firstImage: null,
        error: `GNews request failed with status ${status}`,
      });
    }

    const data = (await response.json()) as GNewsDebugResponse;
    const articles = data.articles ?? [];
    const imageArticles = articles.filter((article) => hasUsableImage(article.image));

    return Response.json({
      keyPresent: true,
      keyLength,
      requestUrl,
      status,
      rawCount: articles.length,
      imageCount: imageArticles.length,
      firstTitle: articles[0]?.title ?? null,
      firstImage: articles[0]?.image ?? null,
      error: null,
    });
  } catch (error) {
    return Response.json({
      keyPresent: true,
      keyLength,
      requestUrl,
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
