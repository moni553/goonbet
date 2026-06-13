const baseUrl = "https://api.football-data.org/v4";

function buildUrl(path) {
  return `${baseUrl}${path}`;
}

function readScoreValue(scoreBlock, side) {
  if (!scoreBlock) {
    return null;
  }

  if (Number.isFinite(scoreBlock[side])) {
    return Number(scoreBlock[side]);
  }

  const footballDataSide = side === "home" ? "homeTeam" : "awayTeam";
  if (Number.isFinite(scoreBlock[footballDataSide])) {
    return Number(scoreBlock[footballDataSide]);
  }

  return null;
}

export function buildFootballDataCompetitionFeed({
  competitionCode = "WC",
  dateFrom,
  dateTo,
} = {}) {
  const matchesUrl = new URL(buildUrl(`/competitions/${competitionCode}/matches`));
  if (dateFrom) {
    matchesUrl.searchParams.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    matchesUrl.searchParams.set("dateTo", dateTo);
  }

  return {
    competitionMatches: matchesUrl.toString(),
    competitionRoot: buildUrl(`/competitions/${competitionCode}`),
    standings: buildUrl(`/competitions/${competitionCode}/standings`),
    matchById: (matchId) => buildUrl(`/matches/${matchId}`),
  };
}

export async function fetchFootballDataJson(url, apiToken) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Auth-Token": apiToken,
    },
  });

  if (!response.ok) {
    throw new Error(`football-data.org request failed with ${response.status}`);
  }

  return response.json();
}

export function normalizeFootballDataMatch(rawMatch) {
  const fullTime = rawMatch.score?.fullTime;
  const regularTime = rawMatch.score?.regularTime;

  return {
    awayScore: readScoreValue(fullTime, "away") ?? readScoreValue(regularTime, "away"),
    awayTeam: rawMatch.awayTeam?.name ?? "Away team",
    competition: rawMatch.competition?.name ?? "Competition",
    fixtureSource: "football-data.org",
    group: rawMatch.group ?? null,
    homeScore: readScoreValue(fullTime, "home") ?? readScoreValue(regularTime, "home"),
    homeTeam: rawMatch.homeTeam?.name ?? "Home team",
    kickoff: rawMatch.utcDate,
    provider: "football-data",
    providerMatchId: String(rawMatch.id),
    stage: rawMatch.stage ?? null,
    status: rawMatch.status ?? "SCHEDULED",
  };
}
