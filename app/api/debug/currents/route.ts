type CurrentsDebugResponse = {
  news?: Array<{
    title?: string | null;
    url?: string | null;
    image?: string | null;
    published?: string | null;
    author?: string | null;
    source?: string | { name?: string | null } | null;
  }>;
};

export async function GET() {
  const currentsApiKey = process.env.CURRENTS_API_KEY ?? "";
  const url = new URL("https://api.currentsapi.services/v1/search");
  url.searchParams.set("keywords", "breaking news");
  url.searchParams.set("language", "en");
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("apiKey", currentsApiKey);

  if (!currentsApiKey) {
    return Response.json({
      keyPresent: false,
      requestUrl: url.toString().replace("apiKey=", "apiKey=[MISSING]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: "Provider skipped: missing key",
    });
  }

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: 60 },
    });

    const payload = (await response.json()) as CurrentsDebugResponse;
    const items = (payload.news ?? []).map((article) => ({
      title: article.title ?? null,
      imageUrl: article.image ?? null,
      hasImage: Boolean(article.image),
    }));

    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(currentsApiKey, "[REDACTED]"),
      status: response.status,
      rawCount: payload.news?.length ?? 0,
      imageCount: items.filter((item) => item.hasImage).length,
      firstTitle: items[0]?.title ?? null,
      firstImage: items[0]?.imageUrl ?? null,
      error: response.ok ? null : `Currents request failed (${response.status})`,
    });
  } catch (error) {
    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(currentsApiKey, "[REDACTED]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
