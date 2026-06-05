const baseUrl = "https://api.the-odds-api.com/v4";

function mostCommonPoint(points) {
  const counts = new Map();

  points.forEach((point) => {
    const key = Number(point);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export function buildTheOddsApiRequest({
  apiKey,
  bookmaker = "",
  market = "h2h,totals",
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
      const h2hMarket = bookmaker.markets?.find((item) => item.key === "h2h");
      const totalMarket = bookmaker.markets?.find((item) => item.key === "totals");
      const outcomes = h2hMarket?.outcomes ?? [];
      const totalOutcomes = totalMarket?.outcomes ?? [];

      const homeOutcome = outcomes.find((item) => item.name === rawMatch.home_team);
      const awayOutcome = outcomes.find((item) => item.name === rawMatch.away_team);
      const drawOutcome = outcomes.find((item) => item.name.toLowerCase() === "draw");
      const overOutcome = totalOutcomes.find((item) => item.name?.toLowerCase() === "over");
      const underOutcome = totalOutcomes.find((item) => item.name?.toLowerCase() === "under");

      return {
        bookmaker: bookmaker.title ?? bookmaker.key ?? "Unknown bookmaker",
        lastUpdate: bookmaker.last_update ?? null,
        odds: {
          AWAY: Number(awayOutcome?.price ?? 0),
          DRAW: Number(drawOutcome?.price ?? 0),
          HOME: Number(homeOutcome?.price ?? 0),
        },
        totals: {
          OVER: Number(overOutcome?.price ?? 0),
          UNDER: Number(underOutcome?.price ?? 0),
          point: Number(overOutcome?.point ?? underOutcome?.point ?? 0) || null,
        },
      };
    })
    .filter(
      (quote) =>
        quote.odds.HOME ||
        quote.odds.DRAW ||
        quote.odds.AWAY ||
        quote.totals.OVER ||
        quote.totals.UNDER,
    );

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

  const totalPoints = quotes
    .map((quote) => quote.totals.point)
    .filter((point) => Number.isFinite(point) && point > 0);
  const preferredTotalsPoint = mostCommonPoint(totalPoints);
  const totalsOrigins = { OVER: null, UNDER: null };
  const totals = { OVER: null, UNDER: null, point: preferredTotalsPoint };

  ["OVER", "UNDER"].forEach((selection) => {
    const bestQuote = quotes
      .filter(
        (quote) =>
          Number(quote.totals[selection]) > 0 &&
          (preferredTotalsPoint == null || Number(quote.totals.point) === Number(preferredTotalsPoint)),
      )
      .sort((left, right) => right.totals[selection] - left.totals[selection])[0];

    totals[selection] = bestQuote ? Number(bestQuote.totals[selection]) : null;
    totalsOrigins[selection] = bestQuote ? bestQuote.bookmaker : null;
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
    totals,
    totalsOrigins,
    providerEventId: rawMatch.id,
    sportKey: rawMatch.sport_key,
    sportTitle: rawMatch.sport_title ?? "Odds market",
  };
}
