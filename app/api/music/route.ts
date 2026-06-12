import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  Vary: "Origin",
} as const;

type AppleRssAlbum = {
  id?: string;
  name?: string;
  artistName?: string;
  artworkUrl100?: string;
  url?: string;
};

type ItunesAlbum = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
};

type MusicAlbumItem = {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  sourceLabel: string;
  rank: number;
  url: string | null;
};

function normalizeAlbumImage(url: string | undefined | null) {
  if (!url) {
    return null;
  }

  return url.replace(/\/[0-9]+x[0-9]+bb\./i, "/600x600bb.");
}

function buildAlbumDedupeKey(title: string, artist: string) {
  return `${title}::${artist}`
    .toLowerCase()
    .replace(/[^\w\s:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeAlbums(albums: MusicAlbumItem[]) {
  const seen = new Set<string>();
  const deduped: MusicAlbumItem[] = [];

  for (const album of albums) {
    const key = buildAlbumDedupeKey(album.title, album.artist);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(album);
  }

  return deduped.map((album, index) => ({
    ...album,
    rank: index + 1,
  }));
}

async function fetchAppleChartAlbums() {
  const response = await fetch(
    "https://rss.marketingtools.apple.com/api/v2/us/music/most-played/25/albums.json",
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    throw new Error(`Apple chart request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    feed?: {
      results?: AppleRssAlbum[];
    };
  };

  return (payload.feed?.results ?? [])
    .map((album, index) => {
      const imageUrl = normalizeAlbumImage(album.artworkUrl100);
      const title = album.name?.trim() ?? "";
      const artist = album.artistName?.trim() ?? "";

      if (!imageUrl || !title || !artist) {
        return null;
      }

      return {
        id: album.id?.trim() || `apple-chart-${index}`,
        title,
        artist,
        imageUrl,
        sourceLabel: "Apple Music",
        rank: index + 1,
        url: album.url?.trim() ?? null,
      } satisfies MusicAlbumItem;
    })
    .filter((album): album is MusicAlbumItem => Boolean(album));
}

async function fetchItunesSearchAlbums() {
  const queries = [
    "top albums",
    "new albums",
    "pop albums",
    "hip hop albums",
    "country albums",
    "rock albums",
    "r&b albums",
  ];

  const payloads = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=12`,
        {
          cache: "no-store",
          next: { revalidate: 0 },
        }
      );

      if (!response.ok) {
        return [] as MusicAlbumItem[];
      }

      const payload = (await response.json()) as {
        results?: ItunesAlbum[];
      };

      return (payload.results ?? [])
        .map((album, index) => {
          const imageUrl = normalizeAlbumImage(album.artworkUrl100);
          const title = album.collectionName?.trim() ?? "";
          const artist = album.artistName?.trim() ?? "";

          if (!imageUrl || !title || !artist) {
            return null;
          }

          return {
            id: String(album.collectionId ?? `${query}-${index}`),
            title,
            artist,
            imageUrl,
            sourceLabel: "iTunes",
            rank: index + 1,
            url: album.collectionViewUrl?.trim() ?? null,
          } satisfies MusicAlbumItem;
        })
        .filter((album): album is MusicAlbumItem => Boolean(album));
    })
  );

  return dedupeAlbums(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET() {
  try {
    const chartAlbums = await fetchAppleChartAlbums().catch(() => [] as MusicAlbumItem[]);

    if (chartAlbums.length >= 3) {
      return NextResponse.json({
        albums: dedupeAlbums(chartAlbums).slice(0, 10),
        source: "apple-chart",
      }, {
        headers: CORS_HEADERS,
      });
    }

    const searchAlbums = await fetchItunesSearchAlbums();
    const combinedAlbums = dedupeAlbums([...chartAlbums, ...searchAlbums]).slice(0, 10);

    return NextResponse.json({
      albums: combinedAlbums,
      source: chartAlbums.length > 0 ? "apple-chart+itunes-search" : "itunes-search",
    }, {
      headers: CORS_HEADERS,
    });
  } catch (error) {
    console.error("Music API load failed", error);
    return NextResponse.json(
      {
        albums: [] as MusicAlbumItem[],
        source: "error",
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }
}
