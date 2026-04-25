type NewsApiArticle = {
  content?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  title: string;
  url?: string | null;
  urlToImage?: string | null;
  source: {
    name: string;
  };
};

const CATEGORY_OPTIONS = [
  "Business",
  "Tech",
  "Sports",
  "Politics",
  "Health",
  "Science",
  "Entertainment",
  "World",
];

function hashArticleId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
}

export async function GET() {
  const res = await fetch(
    "https://newsapi.org/v2/top-headlines?country=us&pageSize=10",
    {
      headers: {
        Authorization: "200bc3d2913541a6a40bbfc887d1d5f1",
      },
    }
  );

  const data = (await res.json()) as { articles?: NewsApiArticle[] };
  const sourceArticles = data.articles ?? [];

  const articles = sourceArticles.map((item, index) => ({
    id: hashArticleId(
      item.url ?? `${item.title}-${item.source?.name ?? "unknown"}-${index}`
    ),
    title: item.title,
    source: item.source?.name ?? "Unknown",
    category: CATEGORY_OPTIONS[index % CATEGORY_OPTIONS.length],
    time: "Recent",
    image: item.urlToImage,
    description: item.description,
    url: item.url,
    publishedAt: item.publishedAt,
    content: item.content,
    likes: Math.floor(Math.random() * 50),
    comments: [],
  }));

  return Response.json(articles);
}
