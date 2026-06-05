const baseUrl = "https://api.the-odds-api.com/v4";

export function buildTheOddsApiRequest({
  apiKey,
  bookmaker = "",
  market = "h2h",
  oddsFormat = "decimal",
  region = "uk",
  sportKey,
}) {
  const url = new URL(`${baseUrl}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);
  url.searchParams.set("markets", market);
  url.searchParams.set("oddsFormat", oddsFormat);

  if (bookmaker) {
    url.searchParams.set("bookmakers", bookmaker);
  }

  return url.toString();
}

export async function fetchTheOddsApiJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`The Odds API request failed with ${response.status}`);
  }

  return response.json();
}

export function normalizeTheOddsApiMatch(rawMatch) {
  const quotes = (rawMatch.bookmakers ?? [])
    .map((bookmaker) => {
      const market = bookmaker.markets?.find((item) => item.key === "h2h");
      const outcomes = market?.outcomes ?? [];

      const homeOutcome = outcomes.find((item) => item.name === rawMatch.home_team);
      const awayOutcome = outcomes.find((item) => item.name === rawMatch.away_team);
      const drawOutcome = outcomes.find((item) => item.name.toLowerCase() === "draw");

      return {
        bookmaker: bookmaker.title ?? bookmaker.key ?? "Unknown bookmaker",
        lastUpdate: bookmaker.last_update ?? null,
        odds: {
          AWAY: Number(awayOutcome?.price ?? 0),
          DRAW: Number(drawOutcome?.price ?? 0),
          HOME: Number(homeOutcome?.price ?? 0),
        },
      };
    })
    .filter((quote) => quote.odds.HOME || quote.odds.DRAW || quote.odds.AWAY);

  const selections = ["HOME", "DRAW", "AWAY"];
  const bestOdds = {};
  const oddsOrigins = {};

  selections.forEach((selection) => {
    const bestQuote = quotes
      .filter((quote) => Number(quote.odds[selection]) > 0)
      .sort((left, right) => right.odds[selection] - left.odds[selection])[0];

    bestOdds[selection] = bestQuote ? Number(bestQuote.odds[selection]) : null;
    oddsOrigins[selection] = bestQuote ? bestQuote.bookmaker : null;
  });

  const primaryBookmaker = quotes[0]?.bookmaker ?? "No bookmaker";

  return {
    away: rawMatch.away_team,
    bookmaker: primaryBookmaker,
    bookmakerCount: quotes.length,
    home: rawMatch.home_team,
    kickoff: rawMatch.commence_time,
    odds: bestOdds,
    oddsOrigins,
    oddsSource: "The Odds API",
    quotes,
    providerEventId: rawMatch.id,
    sportKey: rawMatch.sport_key,
    sportTitle: rawMatch.sport_title ?? "Odds market",
  };
}
