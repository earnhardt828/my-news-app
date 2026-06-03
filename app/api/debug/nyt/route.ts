const NYT_API_KEY = process.env.NYT_API_KEY ?? "";

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
  const section = "home";
  const url = new URL(`https://api.nytimes.com/svc/topstories/v2/${section}.json`);
  url.searchParams.set("api-key", NYT_API_KEY);

  if (!NYT_API_KEY) {
    return Response.json({
      provider: "nyt",
      keyPresent: false,
      requestUrl: url.toString().replace("api-key=", "api-key=[MISSING]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      items: [],
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

    return {
      title: article.title ?? null,
      url: article.url ?? null,
      imageUrl: largestImage?.url ?? null,
      hasImage: Boolean(largestImage?.url),
    };
  });

  return Response.json({
    provider: "nyt",
    keyPresent: true,
    requestUrl: url.toString().replace(NYT_API_KEY, "[REDACTED]"),
    status: response.status,
    rawCount: payload.results?.length ?? 0,
    imageCount: items.filter((item) => item.hasImage).length,
    items,
  });
}
