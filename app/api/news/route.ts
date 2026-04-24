type NewsApiArticle = {
  title: string;
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
    id: index + 1,
    title: item.title,
    source: item.source?.name ?? "Unknown",
    category: CATEGORY_OPTIONS[index % CATEGORY_OPTIONS.length],
    time: "Recent",
    likes: Math.floor(Math.random() * 50),
    comments: [],
  }));

  return Response.json(articles);
}
