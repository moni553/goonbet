const baseUrl = "https://api.sportmonks.com/v3/football";
const worldCupLeagueId = "732";

function buildUrl(path, params) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

export function buildSportmonksWorldCupFeed(apiToken) {
  return {
    fixtures: buildUrl("/fixtures", {
      api_token: apiToken,
      filters: `fixtureLeagues:${worldCupLeagueId}`,
      include: "participants;scores;state",
    }),
    liveLatest: buildUrl("/livescores/latest", {
      api_token: apiToken,
      filters: `fixtureLeagues:${worldCupLeagueId}`,
      include: "scores;participants;events;lineups",
    }),
    liveAll: buildUrl("/livescores", {
      api_token: apiToken,
      filters: `fixtureLeagues:${worldCupLeagueId}`,
      include: "scores;participants;state",
    }),
    standings: buildUrl(`/standings/live/leagues/${worldCupLeagueId}`, {
      api_token: apiToken,
    }),
  };
}

export async function fetchSportmonksJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Sportmonks request failed with ${response.status}`);
  }

  return response.json();
}

export function normalizeSportmonksFixture(rawFixture) {
  const home = rawFixture.participants?.find((participant) => participant.meta?.location === "home");
  const away = rawFixture.participants?.find((participant) => participant.meta?.location === "away");
  const score = rawFixture.scores?.find((item) => item.description === "CURRENT");

  return {
    awayScore: score?.score?.participant === away?.id ? score?.score?.goals : rawFixture.scores?.away,
    awayTeam: away?.name ?? "Away team",
    homeScore: score?.score?.participant === home?.id ? score?.score?.goals : rawFixture.scores?.home,
    homeTeam: home?.name ?? "Home team",
    kickoff: rawFixture.starting_at,
    provider: "sportmonks",
    providerMatchId: String(rawFixture.id),
    status: rawFixture.state?.state ?? rawFixture.state?.name ?? "SCHEDULED",
  };
}
