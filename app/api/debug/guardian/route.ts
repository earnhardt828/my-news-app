const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY ?? "";

type GuardianDebugResponse = {
  response?: {
    results?: Array<{
      webTitle?: string | null;
      webUrl?: string | null;
      fields?: {
        thumbnail?: string | null;
      } | null;
    }>;
  };
};

export async function GET() {
  const query = "news";
  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("api-key", GUARDIAN_API_KEY);
  url.searchParams.set("page-size", "10");
  url.searchParams.set("page", "1");
  url.searchParams.set("show-fields", "headline,trailText,thumbnail");
  url.searchParams.set("q", query);

  if (!GUARDIAN_API_KEY) {
    return Response.json({
      provider: "guardian",
      keyPresent: false,
      skippedReason: "Provider skipped: missing key",
      requestUrl: url.toString().replace("api-key=", "api-key=[MISSING]"),
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

  const payload = (await response.json()) as GuardianDebugResponse;
  const items = (payload.response?.results ?? []).map((article) => ({
    title: article.webTitle ?? null,
    url: article.webUrl ?? null,
    imageUrl: article.fields?.thumbnail ?? null,
    hasImage: Boolean(article.fields?.thumbnail),
  }));

  return Response.json({
    provider: "guardian",
    keyPresent: true,
    requestUrl: url.toString().replace(GUARDIAN_API_KEY, "[REDACTED]"),
    status: response.status,
    rawCount: payload.response?.results?.length ?? 0,
    imageCount: items.filter((item) => item.hasImage).length,
    first: items[0] ?? null,
    bodyPreview: (payload.response?.results ?? []).slice(0, 1),
  });
}
