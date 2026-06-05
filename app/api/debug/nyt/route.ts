import { fetchNytTopStories } from "@/lib/server/nytProvider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await fetchNytTopStories(["home"]);
  const articles = result.articles.map((article, index) => ({
    id: index + 1,
    title: article.title,
    description: article.description,
    url: article.url,
    source: "The New York Times",
    publishedAt: article.publishedAt,
    imageUrl: article.imageUrl,
    provider: "nyt",
  }));

  return Response.json({
    keyPresent: result.keyPresent,
    keyLength: result.keyLength,
    status: result.status,
    rawCount: result.rawCount,
    imageCount: result.imageCount,
    firstTitle: result.firstTitle,
    firstImage: result.firstImage,
    error: result.error,
    articles,
    articlesLength: articles.length,
    firstArticleTitle: articles[0]?.title || null,
  });
}
