import { FAVORITE_TEAMS_BY_LEAGUE } from "../../../lib/favorite-teams";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type SportsDbTeamResponse = {
  teams?: Array<{
    strTeamBadge?: string | null;
    strTeamLogo?: string | null;
    strTeamBanner?: string | null;
    strTeamFanart1?: string | null;
    strTeam?: string | null;
  }> | null;
};

const TEAM_NAMES = Object.values(FAVORITE_TEAMS_BY_LEAGUE)
  .flat()
  .map((team) => team.team_name)
  .sort((left, right) => right.length - left.length);

function jsonResponse(payload: { imageUrl: string | null; source: string | null; team: string | null }) {
  return Response.json(payload, {
    headers: CORS_HEADERS,
  });
}

function findMatchedTeam(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return TEAM_NAMES.find((teamName) => normalized.includes(teamName.toLowerCase())) ?? null;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const matchedTeam = findMatchedTeam(query);

  if (!matchedTeam) {
    return jsonResponse({
      imageUrl: null,
      source: null,
      team: null,
    });
  }

  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(
      matchedTeam
    )}`;
    const response = await fetch(url, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return jsonResponse({
        imageUrl: null,
        source: null,
        team: matchedTeam,
      });
    }

    const data = (await response.json()) as SportsDbTeamResponse;
    const team = data.teams?.[0] ?? null;
    const imageUrl =
      team?.strTeamFanart1?.trim() ||
      team?.strTeamBanner?.trim() ||
      team?.strTeamLogo?.trim() ||
      team?.strTeamBadge?.trim() ||
      null;

    return jsonResponse({
      imageUrl,
      source: imageUrl ? "thesportsdb" : null,
      team: matchedTeam,
    });
  } catch (error) {
    console.error("SPORTS ARTWORK FETCH FAILED", {
      query,
      matchedTeam,
      error,
    });

    return jsonResponse({
      imageUrl: null,
      source: null,
      team: matchedTeam,
    });
  }
}
