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
        imageUrl: fullImageUrl,
        hasImage: Boolean(fullImageUrl),
      };
    });

    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(nytApiKey, "[REDACTED]"),
      status: response.status,
      rawCount: payload.results?.length ?? 0,
      imageCount: items.filter((item) => item.hasImage).length,
      firstTitle: items[0]?.title ?? null,
      firstImage: items[0]?.imageUrl ?? null,
      error: response.ok ? null : `NYT request failed (${response.status})`,
    });
  } catch (error) {
    return Response.json({
      keyPresent: true,
      requestUrl: url.toString().replace(nytApiKey, "[REDACTED]"),
      status: null,
      rawCount: 0,
      imageCount: 0,
      firstTitle: null,
      firstImage: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
