import { NextResponse } from "next/server";

type TmdbMovie = {
  id?: number;
  title?: string | null;
  poster_path?: string | null;
  vote_average?: number | null;
  release_date?: string | null;
  popularity?: number | null;
};

type OmdbMovie = {
  imdbRating?: string | null;
  Ratings?: Array<{
    Source?: string | null;
    Value?: string | null;
  }> | null;
};

type MovieSliderItem = {
  id: string;
  title: string;
  imageUrl: string;
  rank: number;
  releaseDate: string | null;
  tmdbScore: number | null;
  rottenTomatoesScore: string | null;
  imdbRating: string | null;
  sourceLabel: string;
};

type NormalizedTmdbMovie = MovieSliderItem & {
  popularity: number;
};

function normalizePosterUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  return `https://image.tmdb.org/t/p/w500${path}`;
}

async function fetchOmdbDetails(title: string, releaseDate: string | null, apiKey: string) {
  const year = releaseDate?.slice(0, 4) ?? "";
  const response = await fetch(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&t=${encodeURIComponent(
      title
    )}${year ? `&y=${encodeURIComponent(year)}` : ""}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as OmdbMovie & { Response?: string };

  if (payload.Response === "False") {
    return null;
  }

  const rottenTomatoesScore =
    payload.Ratings?.find((rating) => rating.Source === "Rotten Tomatoes")?.Value?.trim() ?? null;

  return {
    rottenTomatoesScore,
    imdbRating: payload.imdbRating?.trim() ?? null,
  };
}

export async function GET() {
  const tmdbApiKey = process.env.TMDB_API_KEY?.trim();
  const omdbApiKey = process.env.OMDB_API_KEY?.trim() ?? "";

  if (!tmdbApiKey) {
    return NextResponse.json({ movies: [] as MovieSliderItem[], source: "no-tmdb-key" }, { status: 200 });
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${encodeURIComponent(
        tmdbApiKey
      )}&language=en-US&page=1`,
      {
        cache: "no-store",
        next: { revalidate: 0 },
      }
    );

    if (!response.ok) {
      throw new Error(`TMDb now_playing failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      results?: TmdbMovie[];
    };

    const normalizedMovies = (payload.results ?? [])
      .map((movie): NormalizedTmdbMovie | null => {
        const title = movie.title?.trim() ?? "";
        const imageUrl = normalizePosterUrl(movie.poster_path);

        if (!title || !imageUrl) {
          return null;
        }

        const normalizedMovie: NormalizedTmdbMovie = {
          id: String(movie.id ?? title),
          title,
          imageUrl,
          rank: 0,
          releaseDate: movie.release_date?.trim() ?? null,
          tmdbScore:
            typeof movie.vote_average === "number" && Number.isFinite(movie.vote_average)
              ? Number(movie.vote_average.toFixed(1))
              : null,
          rottenTomatoesScore: null,
          imdbRating: null,
          sourceLabel: "TMDb",
          popularity: typeof movie.popularity === "number" ? movie.popularity : 0,
        };

        return normalizedMovie;
      })
      .filter(
        (movie): movie is NormalizedTmdbMovie => Boolean(movie)
      )
      .sort((left, right) => right.popularity - left.popularity)
      .slice(0, 10);

    const omdbEnrichment = omdbApiKey
      ? await Promise.allSettled(
          normalizedMovies.map((movie) => fetchOmdbDetails(movie.title, movie.releaseDate, omdbApiKey))
        )
      : [];

    const movies = normalizedMovies.map((movie, index) => {
      const omdbDetails =
        omdbEnrichment[index]?.status === "fulfilled" ? omdbEnrichment[index].value : null;

      return {
        id: movie.id,
        title: movie.title,
        imageUrl: movie.imageUrl,
        rank: index + 1,
        releaseDate: movie.releaseDate,
        tmdbScore: movie.tmdbScore,
        rottenTomatoesScore: omdbDetails?.rottenTomatoesScore ?? null,
        imdbRating: omdbDetails?.imdbRating ?? null,
        sourceLabel: movie.sourceLabel,
      } satisfies MovieSliderItem;
    });

    return NextResponse.json(
      {
        movies,
        source: omdbApiKey ? "tmdb+omdb" : "tmdb",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Movies API load failed", error);
    return NextResponse.json({ movies: [] as MovieSliderItem[], source: "error" }, { status: 200 });
  }
}
