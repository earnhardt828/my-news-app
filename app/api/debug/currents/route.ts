export const dynamic = "force-dynamic";
export const revalidate = 0;

type CurrentsDebugResponse = {
  news?: Array<{
    title?: string | null;
    image?: string | null;
  }>;
};

function hasUsableImage(url: string | null | undefined) {
  const normalized = url?.trim() ?? "";

  if (!normalized) {
    return false;
  }

  return /^https?:\/\//i.test(normalized);
}

export async function GET() {
  const currentsApiKey = process.env.CURRENTS_API_KEY ?? "";
  const keyPresent = Boolean(currentsApiKey);
  const keyLength = currentsApiKey.length;
  const requestUrl = "https://api.currentsapi.services/v1/latest-news";

  if (!keyPresent) {
    return Response.json({
      keyPresent: false,
      keyLength,
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: "Provider skipped: missing key",
    });
  }

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: currentsApiKey,
      },
      next: { revalidate: 0 },
    });

    const status = response.status;

    if (!response.ok) {
      return Response.json({
        keyPresent: true,
        keyLength,
        status,
        rawCount: 0,
        imageCount: 0,
        firstTitle: null,
        firstImage: null,
        error: `Currents request failed with status ${status}`,
      });
    }

    const payload = (await response.json()) as CurrentsDebugResponse;
    const articles = payload.news ?? [];
    const imageArticles = articles.filter((article) => hasUsableImage(article.image));

    return Response.json({
      keyPresent: true,
      keyLength,
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
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
