import {
  buildStaticFallbackPodcastDirectory,
  fetchPodcastDirectory,
  fetchPodcastEpisodeBySlug,
  fetchPodcastShowBySlug,
} from "../../../lib/podcasts";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const podcastSlug = requestUrl.searchParams.get("podcastSlug")?.trim() ?? "";
  const episodeSlug = requestUrl.searchParams.get("episodeSlug")?.trim() ?? "";
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";

  try {
    if (podcastSlug && !episodeSlug) {
      const result = await fetchPodcastShowBySlug(podcastSlug);

      if (!result) {
        return Response.json({ podcast: null }, { status: 404 });
      }

      return Response.json({ podcast: { show: result, episode: result.latestEpisode } });
    }

    if (podcastSlug && episodeSlug) {
      const result = await fetchPodcastEpisodeBySlug(podcastSlug, episodeSlug);

      if (!result) {
        return Response.json({ podcast: null }, { status: 404 });
      }

      return Response.json({ podcast: result });
    }

    const directory = await fetchPodcastDirectory(query || undefined);
    return Response.json(directory);
  } catch (error) {
    console.error("PODCAST API ERROR", error);
    const filteredFallback = buildStaticFallbackPodcastDirectory(query || undefined);
    return Response.json(
      filteredFallback.shows.length > 0 ? filteredFallback : buildStaticFallbackPodcastDirectory(),
      { status: 200 }
    );
  }
}
