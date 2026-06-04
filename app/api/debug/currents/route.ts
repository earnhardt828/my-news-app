const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY ?? "";

type CurrentsDebugResponse = {
  news?: Array<{
    title?: string | null;
    url?: string | null;
    image?: string | null;
    published?: string | null;
    author?: string | null;
  }>;
};

export async function GET() {
  const url = new URL("https://api.currentsapi.services/v1/search");
  url.searchParams.set("keywords", "breaking news");
  url.searchParams.set("language", "en");
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("apiKey", CURRENTS_API_KEY);

  if (!CURRENTS_API_KEY) {
    return Response.json({
      provider: "currents",
      keyPresent: false,
      skippedReason: "Provider skipped: missing key",
      requestUrl: url.toString().replace("apiKey=", "apiKey=[MISSING]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      first: null,
      bodyPreview: null,
    });
  }

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 },
  });

  const payload = (await response.json()) as CurrentsDebugResponse;
  const items = (payload.news ?? []).map((article) => ({
    title: article.title ?? null,
    url: article.url ?? null,
    imageUrl: article.image ?? null,
    hasImage: Boolean(article.image),
    author: article.author ?? null,
    published: article.published ?? null,
  }));

  return Response.json({
    provider: "currents",
    keyPresent: true,
    requestUrl: url.toString().replace(CURRENTS_API_KEY, "[REDACTED]"),
    status: response.status,
    rawCount: payload.news?.length ?? 0,
    imageCount: items.filter((item) => item.hasImage).length,
    first: items[0] ?? null,
    bodyPreview: (payload.news ?? []).slice(0, 1),
  });
}
