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
  const guardianApiKey = process.env.GUARDIAN_API_KEY ?? "";
  const query = "news";
  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("api-key", guardianApiKey);
  url.searchParams.set("page-size", "10");
  url.searchParams.set("page", "1");
  url.searchParams.set("show-fields", "headline,trailText,thumbnail");
  url.searchParams.set("q", query);

  if (!guardianApiKey) {
    return Response.json({
      keyPresent: false,
      requestUrl: url.toString().replace("api-key=", "api-key=[MISSING]"),
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

    const payload = (await response.json()) as GuardianDebugResponse;
    const items = (payload.response?.results ?? []).map((article) => ({
      title: article.webTitle ?? null,
      imageUrl: article.fields?.thumbnail ?? null,
      hasImage: Boolean(article.fields?.thumbnail),
    }));

    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(guardianApiKey, "[REDACTED]"),
      status: response.status,
      rawCount: payload.response?.results?.length ?? 0,
      imageCount: items.filter((item) => item.hasImage).length,
      firstTitle: items[0]?.title ?? null,
      firstImage: items[0]?.imageUrl ?? null,
      error: response.ok ? null : `Guardian request failed (${response.status})`,
    });
  } catch (error) {
    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(guardianApiKey, "[REDACTED]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
