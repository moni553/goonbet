const baseUrl = "https://api.football-data.org/v4";

function buildUrl(path) {
  return `${baseUrl}${path}`;
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
  return {
    awayScore: rawMatch.score?.fullTime?.away ?? null,
    awayTeam: rawMatch.awayTeam?.name ?? "Away team",
    competition: rawMatch.competition?.name ?? "Competition",
    fixtureSource: "football-data.org",
    group: rawMatch.group ?? null,
    homeScore: rawMatch.score?.fullTime?.home ?? null,
    homeTeam: rawMatch.homeTeam?.name ?? "Home team",
    kickoff: rawMatch.utcDate,
    provider: "football-data",
    providerMatchId: String(rawMatch.id),
    stage: rawMatch.stage ?? null,
    status: rawMatch.status ?? "SCHEDULED",
  };
}
