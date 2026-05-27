const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || "123";
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
  statusDetail?: string | null;
  venue?: string | null;
  boxScoreAvailable?: boolean;
  playByPlayAvailable?: boolean;
};

const APP_TIME_ZONE = "America/New_York";
const MLB_TEAM_NAME_PATTERN =
  /\b(yankees|dodgers|braves|mets|red sox|cubs|phillies|astros|rangers|padres|orioles|tigers|guardians|mariners|giants|cardinals|brewers|diamondbacks|blue jays|royals|twins|reds|pirates|rays|marlins|rockies|athletics|angels|nationals|white sox)\b/i;

function isLeagueKey(value: string): value is ScoreLeagueKey {
  return value in SPORTS_SCORE_LEAGUES;
}

function parseSportsDbDateTime(date: string | null, time: string | null) {
  if (!date) {
    return null;
  }

  const normalizedTime = (time ?? "00:00:00").trim() || "00:00:00";
  const isoValue = `${date}T${normalizedTime.endsWith("Z") ? normalizedTime.slice(0, -1) : normalizedTime}Z`;
  const parsedDate = new Date(isoValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function getEasternDayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatGameShortDetail(date: string | null, time: string | null) {
  const parsedDate = parseSportsDbDateTime(date, time);

  if (!parsedDate) {
    return null;
  }

  const now = new Date();
  const todayKey = getEasternDayKey(now);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getEasternDayKey(tomorrowDate);
  const scheduledKey = getEasternDayKey(parsedDate);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);

  if (scheduledKey === todayKey) {
    return `Today ${timeLabel} ET`;
  }

  if (scheduledKey === tomorrowKey) {
    return `Tomorrow ${timeLabel} ET`;
  }

  const weekdayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(parsedDate);

  return `${weekdayLabel} ${timeLabel} ET`;
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

function getEasternDateOffsetIso(offsetDays: number) {
  const now = new Date();
  const easternString = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000));
  return easternString;
}

async function fetchSportsDbEventsByPath(apiKey: string, path: string) {
  const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/${path}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return [] as Array<Record<string, string | null>>;
  }

  const payload = (await response.json()) as { events?: Array<Record<string, string | null>> };
  return payload.events ?? [];
}

function isLikelyMlbEvent(event: Record<string, string | null>) {
  const haystack = `${event.strLeague ?? ""} ${event.strSport ?? ""} ${event.strHomeTeam ?? ""} ${
    event.strAwayTeam ?? ""
  } ${event.strSeason ?? ""}`;
  return /\bmlb\b/i.test(haystack) || MLB_TEAM_NAME_PATTERN.test(haystack);
}

async function fetchTheSportsDbLeagueScores(league: ScoreLeagueKey): Promise<SportsScoreGame[]> {
  const config = SPORTS_SCORE_LEAGUES[league];
  const apiKey = process.env.THESPORTSDB_API_KEY || "123";
  console.log("SPORTS DB API KEY USED", apiKey);
  const todayEastern = getEasternDateOffsetIso(0);
  const tomorrowEastern = getEasternDateOffsetIso(1);
  const yesterdayEastern = getEasternDateOffsetIso(-1);

  const [nextLeagueEvents, pastLeagueEvents, todaySportEvents, tomorrowSportEvents, yesterdaySportEvents] =
    await Promise.all([
      fetchSportsDbEventsByPath(apiKey, `eventsnextleague.php?id=${config.theSportsDbLeagueId}`),
      fetchSportsDbEventsByPath(apiKey, `eventspastleague.php?id=${config.theSportsDbLeagueId}`),
      league === "MLB"
        ? fetchSportsDbEventsByPath(apiKey, `eventsday.php?d=${todayEastern}&s=Baseball`)
        : Promise.resolve([] as Array<Record<string, string | null>>),
      league === "MLB"
        ? fetchSportsDbEventsByPath(apiKey, `eventsday.php?d=${tomorrowEastern}&s=Baseball`)
        : Promise.resolve([] as Array<Record<string, string | null>>),
      league === "MLB"
        ? fetchSportsDbEventsByPath(apiKey, `eventsday.php?d=${yesterdayEastern}&s=Baseball`)
        : Promise.resolve([] as Array<Record<string, string | null>>),
    ]);

  const combined = [
    ...pastLeagueEvents,
    ...nextLeagueEvents,
    ...(league === "MLB" ? todaySportEvents.filter(isLikelyMlbEvent) : []),
    ...(league === "MLB" ? tomorrowSportEvents.filter(isLikelyMlbEvent) : []),
    ...(league === "MLB" ? yesterdaySportEvents.filter(isLikelyMlbEvent) : []),
  ];

  console.log("SCORES RAW RESPONSE", {
    league,
    nextCount: nextLeagueEvents.length,
    pastCount: pastLeagueEvents.length,
    todaySportCount: todaySportEvents.length,
    tomorrowSportCount: tomorrowSportEvents.length,
    yesterdaySportCount: yesterdaySportEvents.length,
  });
  if (league === "MLB") {
    console.log("MLB SCORES RAW COUNT", combined.length);
    console.log("MLB SCORES DATE RANGE", {
      yesterdayEastern,
      todayEastern,
      tomorrowEastern,
    });
  }

  const normalizedGames = combined
    .map((event) => {
      const homeScore = event.intHomeScore ?? null;
      const awayScore = event.intAwayScore ?? null;
      const parsedDate = parseSportsDbDateTime(event.dateEvent ?? null, event.strTime ?? null);

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
        scheduledAt: parsedDate ? parsedDate.toISOString() : null,
        statusDetail: event.strStatus ?? event.strProgress ?? null,
        venue: event.strVenue ?? null,
        boxScoreAvailable: false,
        playByPlayAvailable: false,
      } satisfies SportsScoreGame;
    })
    .filter((game) => game.homeTeam.name && game.awayTeam.name)
    .sort((leftGame, rightGame) => {
      const getStatusRank = (game: SportsScoreGame) =>
        game.status === "Live" ? 4 : game.status === "Today" ? 3 : game.status === "Upcoming" ? 2 : 1;

      const statusDelta = getStatusRank(rightGame) - getStatusRank(leftGame);

      if (statusDelta !== 0) {
        return statusDelta;
      }

      const leftTime = leftGame.scheduledAt ? new Date(leftGame.scheduledAt).getTime() : 0;
      const rightTime = rightGame.scheduledAt ? new Date(rightGame.scheduledAt).getTime() : 0;
      const now = Date.now();
      const leftToday = leftGame.scheduledAt
        ? getEasternDayKey(new Date(leftGame.scheduledAt)) === getEasternDayKey(new Date(now))
        : false;
      const rightToday = rightGame.scheduledAt
        ? getEasternDayKey(new Date(rightGame.scheduledAt)) === getEasternDayKey(new Date(now))
        : false;

      if (leftToday !== rightToday) {
        return Number(rightToday) - Number(leftToday);
      }

      return Math.abs(leftTime - now) - Math.abs(rightTime - now);
    });

  if (league === "MLB") {
    console.log("MLB SCORES FINAL COUNT", normalizedGames.length);
    console.log(
      "MLB SCORES SAMPLE",
      normalizedGames.slice(0, 5).map((game) => ({
        id: game.id,
        away: game.awayTeam.name,
        home: game.homeTeam.name,
        status: game.status,
        shortDetail: game.shortDetail,
        scheduledAt: game.scheduledAt,
      }))
    );
  }

  console.log("SCORES FINAL COUNT", league, normalizedGames.length);
  return normalizedGames;
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
        statusDetail:
          typeof status.long === "string"
            ? status.long
            : typeof status.short === "string"
              ? status.short
              : null,
        venue:
          typeof fixture.venue === "object" && fixture.venue && "name" in fixture.venue
            ? String((fixture.venue as { name?: unknown }).name ?? "")
            : null,
        boxScoreAvailable: false,
        playByPlayAvailable: false,
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

  const hasConfiguredProvider = Boolean((process.env.THESPORTSDB_API_KEY || "123") || API_SPORTS_KEY);

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
