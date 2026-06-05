import { fetchNytTopStories } from "@/lib/server/nytProvider";

export async function GET() {
  const result = await fetchNytTopStories(["home"]);
  return Response.json(result);
}
