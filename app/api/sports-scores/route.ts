const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY ?? "";
const API_SPORTS_KEY = process.env.API_SPORTS_KEY ?? "";

const SPORTS_SCORE_LEAGUES = {
  NFL: {
    theSportsDbLeagueId: "4391",
    apiSportsSport: "american-football",
    apiSportsLeague: "1",
  },
  NBA: {
    theSportsDbLeagueId: "4387",
    apiSportsSport: "basketball",
    apiSportsLeague: "12",
  },
  MLB: {
    theSportsDbLeagueId: "4424",
    apiSportsSport: "baseball",
    apiSportsLeague: "1",
  },
  NHL: {
    theSportsDbLeagueId: "4380",
    apiSportsSport: "hockey",
    apiSportsLeague: "57",
  },
  MLS: {
    theSportsDbLeagueId: "4346",
    apiSportsSport: "football",
    apiSportsLeague: "253",
  },
} as const;

type ScoreLeagueKey = keyof typeof SPORTS_SCORE_LEAGUES;

type SportsScoreGame = {
  id: string;
  league: ScoreLeagueKey;
  status: "Live" | "Final" | "Today" | "Upcoming";
  homeTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  awayTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  shortDetail: string | null;
  scheduledAt: string | null;
};

function isLeagueKey(value: string): value is ScoreLeagueKey {
  return value in SPORTS_SCORE_LEAGUES;
}

function formatGameShortDetail(date: string | null, time: string | null) {
  const combined = `${date ?? ""} ${time ?? ""}`.trim();

  if (!combined) {
    return null;
  }

  const timestamp = new Date(combined).getTime();

  if (Number.isNaN(timestamp)) {
    return time ?? date ?? null;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function normalizeTheSportsDbStatus(
  rawStatus: string | null,
  homeScore: string | null,
  awayScore: string | null
) {
  const normalized = (rawStatus ?? "").toLowerCase();

  if (/(in play|live|q[1-4]|period|inning|half|et|ot)/.test(normalized)) {
    return "Live" as const;
  }

  if (/(match finished|finished|ft|final)/.test(normalized)) {
    return "Final" as const;
  }

  if (homeScore !== null || awayScore !== null) {
    return "Final" as const;
  }

  if (/(scheduled|not started|ns)/.test(normalized)) {
    return "Upcoming" as const;
  }

  return "Today" as const;
}

async function fetchTheSportsDbLeagueScores(league: ScoreLeagueKey): Promise<SportsScoreGame[]> {
  const config = SPORTS_SCORE_LEAGUES[league];
  const [nextResponse, pastResponse] = await Promise.all([
    fetch(
      `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}/eventsnextleague.php?id=${config.theSportsDbLeagueId}`,
      { next: { revalidate: 300 } }
    ),
    fetch(
      `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}/eventspastleague.php?id=${config.theSportsDbLeagueId}`,
      { next: { revalidate: 300 } }
    ),
  ]);

  if (!nextResponse.ok && !pastResponse.ok) {
    throw new Error(`TheSportsDB score requests failed for ${league}`);
  }

  const nextPayload = nextResponse.ok
    ? ((await nextResponse.json()) as { events?: Array<Record<string, string | null>> })
    : { events: [] };
  const pastPayload = pastResponse.ok
    ? ((await pastResponse.json()) as { events?: Array<Record<string, string | null>> })
    : { events: [] };

  const combined = [...(pastPayload.events ?? []).slice(0, 5), ...(nextPayload.events ?? []).slice(0, 5)];

  return combined
    .map((event) => {
      const homeScore = event.intHomeScore ?? null;
      const awayScore = event.intAwayScore ?? null;

      return {
        id: event.idEvent ?? `${league}-${event.strHomeTeam}-${event.strAwayTeam}-${event.dateEvent}`,
        league,
        status: normalizeTheSportsDbStatus(event.strStatus ?? null, homeScore, awayScore),
        homeTeam: {
          name: event.strHomeTeam ?? "Home Team",
          logoUrl: event.strHomeTeamBadge ?? null,
          score: homeScore,
        },
        awayTeam: {
          name: event.strAwayTeam ?? "Away Team",
          logoUrl: event.strAwayTeamBadge ?? null,
          score: awayScore,
        },
        shortDetail:
          event.strProgress ?? formatGameShortDetail(event.dateEvent ?? null, event.strTime ?? null),
        scheduledAt: event.dateEvent
          ? new Date(`${event.dateEvent} ${event.strTime ?? "00:00:00"}`).toISOString()
          : null,
      } satisfies SportsScoreGame;
    })
    .filter((game) => game.homeTeam.name && game.awayTeam.name);
}

function normalizeApiSportsStatus(rawStatus: string | null) {
  const normalized = (rawStatus ?? "").toLowerCase();

  if (/(live|in progress|q[1-4]|period|inning|halftime|overtime)/.test(normalized)) {
    return "Live" as const;
  }

  if (/(ft|finished|final)/.test(normalized)) {
    return "Final" as const;
  }

  if (/(not started|scheduled|tbd|time to be defined)/.test(normalized)) {
    return "Upcoming" as const;
  }

  return "Today" as const;
}

async function fetchApiSportsLeagueScores(league: ScoreLeagueKey): Promise<SportsScoreGame[]> {
  const config = SPORTS_SCORE_LEAGUES[league];
  const endpoint = new URL(`https://v1.${config.apiSportsSport}.api-sports.io/games`);
  endpoint.searchParams.set("league", config.apiSportsLeague);
  endpoint.searchParams.set("season", String(new Date().getFullYear()));
  endpoint.searchParams.set("date", new Date().toISOString().slice(0, 10));

  const response = await fetch(endpoint.toString(), {
    headers: {
      "x-apisports-key": API_SPORTS_KEY,
    },
    next: { revalidate: 180 },
  });

  if (!response.ok) {
    throw new Error(`API-Sports score request failed for ${league}`);
  }

  const payload = (await response.json()) as {
    response?: Array<Record<string, unknown>>;
  };

  return (payload.response ?? [])
    .map((game) => {
      const teams = (game.teams ?? {}) as Record<string, Record<string, unknown>>;
      const scores = (game.scores ?? {}) as Record<string, Record<string, unknown>>;
      const status = (game.status ?? {}) as Record<string, unknown>;
      const fixture = (game.game ?? game.fixture ?? {}) as Record<string, unknown>;
      const homeTeam = teams.home ?? {};
      const awayTeam = teams.away ?? {};
      const homeScore = scores.home?.total ?? scores.home?.points ?? null;
      const awayScore = scores.away?.total ?? scores.away?.points ?? null;

      return {
        id: String(fixture.id ?? `${league}-${homeTeam.name}-${awayTeam.name}`),
        league,
        status: normalizeApiSportsStatus(String(status.long ?? status.short ?? "")),
        homeTeam: {
          name: String(homeTeam.name ?? "Home Team"),
          logoUrl: typeof homeTeam.logo === "string" ? homeTeam.logo : null,
          score: homeScore === null ? null : String(homeScore),
        },
        awayTeam: {
          name: String(awayTeam.name ?? "Away Team"),
          logoUrl: typeof awayTeam.logo === "string" ? awayTeam.logo : null,
          score: awayScore === null ? null : String(awayScore),
        },
        shortDetail:
          typeof status.long === "string"
            ? status.long
            : formatGameShortDetail(
                typeof fixture.date === "string" ? fixture.date : null,
                null
              ),
        scheduledAt: typeof fixture.date === "string" ? fixture.date : null,
      } satisfies SportsScoreGame;
    })
    .filter((game) => game.homeTeam.name && game.awayTeam.name);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedLeague = requestUrl.searchParams.get("league")?.trim().toUpperCase() ?? "";
  const leagues = requestedLeague && isLeagueKey(requestedLeague)
    ? [requestedLeague]
    : (Object.keys(SPORTS_SCORE_LEAGUES) as ScoreLeagueKey[]);

  const hasConfiguredProvider = Boolean(THESPORTSDB_API_KEY || API_SPORTS_KEY);

  if (!hasConfiguredProvider) {
    return Response.json({
      providerConfigured: false,
      leagues: Object.fromEntries(leagues.map((league) => [league, []])),
    });
  }

  const entries = await Promise.all(
    leagues.map(async (league) => {
      try {
        const games = THESPORTSDB_API_KEY
          ? await fetchTheSportsDbLeagueScores(league)
          : await fetchApiSportsLeagueScores(league);

        return [league, games] as const;
      } catch (error) {
        console.error("SPORTS SCORES FETCH FAILED", league, error);
        return [league, []] as const;
      }
    })
  );

  return Response.json({
    providerConfigured: true,
    leagues: Object.fromEntries(entries),
  });
}
