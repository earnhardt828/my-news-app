import { fetchPodcastDirectory, fetchPodcastEpisodeBySlug } from "../../../lib/podcasts";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const podcastSlug = requestUrl.searchParams.get("podcastSlug")?.trim() ?? "";
  const episodeSlug = requestUrl.searchParams.get("episodeSlug")?.trim() ?? "";

  try {
    if (podcastSlug && episodeSlug) {
      const result = await fetchPodcastEpisodeBySlug(podcastSlug, episodeSlug);

      if (!result) {
        return Response.json({ podcast: null }, { status: 404 });
      }

      return Response.json({ podcast: result });
    }

    const directory = await fetchPodcastDirectory();
    return Response.json(directory);
  } catch (error) {
    console.error("PODCAST API ERROR", error);
    return Response.json(
      {
        shows: [],
        sections: {
          featured: [],
          news: [],
          sports: [],
          business: [],
          technology: [],
        },
      },
      { status: 200 }
    );
  }
}
