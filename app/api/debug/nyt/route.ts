type NytDebugResponse = {
  results?: Array<{
    title?: string | null;
    url?: string | null;
    multimedia?: Array<{
      url?: string | null;
      width?: number | null;
      height?: number | null;
    }> | null;
  }>;
};

export async function GET() {
  const nytApiKey = process.env.NYT_API_KEY ?? "";
  const section = "home";
  const url = new URL(`https://api.nytimes.com/svc/topstories/v2/${section}.json`);
  url.searchParams.set("api-key", nytApiKey);

  if (!nytApiKey) {
    return Response.json({
      provider: "nyt",
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

  const payload = (await response.json()) as NytDebugResponse;
  const items = (payload.results ?? []).map((article) => {
    const largestImage =
      [...(article.multimedia ?? [])]
        .filter((item) => Boolean(item.url))
        .sort(
          (left, right) =>
            Number(right.width ?? 0) * Number(right.height ?? 0) -
            Number(left.width ?? 0) * Number(left.height ?? 0)
        )[0] ?? null;

    const largestImageUrl = largestImage?.url ?? null;
    const fullImageUrl = largestImageUrl
      ? largestImageUrl.startsWith("http")
        ? largestImageUrl
        : `https://static01.nyt.com/${largestImageUrl.replace(/^\/+/, "")}`
      : null;

    return {
      title: article.title ?? null,
      url: article.url ?? null,
      imageUrl: fullImageUrl,
      hasImage: Boolean(fullImageUrl),
    };
  });

  return Response.json({
    provider: "nyt",
    keyPresent: true,
    requestUrl: url.toString().replace(nytApiKey, "[REDACTED]"),
    status: response.status,
    rawCount: payload.results?.length ?? 0,
    imageCount: items.filter((item) => item.hasImage).length,
    first: items[0] ?? null,
    bodyPreview: (payload.results ?? []).slice(0, 1),
  });
}
