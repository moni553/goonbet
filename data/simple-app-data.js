export const simpleConfig = {
  cacheTtlSeconds: 300,
  defaultStake: 50,
  fallbackOddsSourceLabel: "Demo odds fallback",
  fallbackFixtureSourceLabel: "Demo fixtures fallback",
  liveOddsSourceLabel: "The Odds API",
  liveFixtureSourceLabel: "football-data.org / Sportmonks",
  maxStake: 200,
  matchLookaheadDays: 21,
  pendingNameStorageKey: "goonbet-pending-name",
  startingBankroll: 200,
  tagline:
    "Public weekly match board, real live coefficients when provider keys are configured, and simple username-plus-password betting accounts powered by Supabase.",
};

const rawDemoMatches = [
  {
    id: "w1-001",
    fixtureSource: "Demo fixtures fallback",
    group: "Opening night",
    kickoff: "2026-06-11T19:00:00Z",
    home: "Mexico",
    away: "Japan",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 2.12, DRAW: 3.3, AWAY: 3.5 } },
      { bookmaker: "Betfair", odds: { HOME: 2.1, DRAW: 3.24, AWAY: 3.55 } },
      { bookmaker: "Bet365", odds: { HOME: 2.08, DRAW: 3.28, AWAY: 3.46 } },
    ],
    oddsOrigins: {
      AWAY: "Betfair",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.12, DRAW: 3.3, AWAY: 3.5 },
  },
  {
    id: "w1-002",
    fixtureSource: "Demo fixtures fallback",
    group: "Group A",
    kickoff: "2026-06-12T16:00:00Z",
    home: "Netherlands",
    away: "USA",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Bet365", odds: { HOME: 1.93, DRAW: 3.42, AWAY: 4.08 } },
      { bookmaker: "Pinnacle", odds: { HOME: 1.91, DRAW: 3.38, AWAY: 4.02 } },
      { bookmaker: "Betfair", odds: { HOME: 1.89, DRAW: 3.31, AWAY: 4.1 } },
    ],
    oddsOrigins: {
      AWAY: "Betfair",
      DRAW: "Bet365",
      HOME: "Bet365",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.93, DRAW: 3.42, AWAY: 4.08 },
  },
  {
    id: "w1-003",
    fixtureSource: "Demo fixtures fallback",
    group: "Group B",
    kickoff: "2026-06-12T20:00:00Z",
    home: "Brazil",
    away: "Serbia",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 1.62, DRAW: 3.92, AWAY: 5.45 } },
      { bookmaker: "Bet365", odds: { HOME: 1.59, DRAW: 3.88, AWAY: 5.3 } },
      { bookmaker: "Betfair", odds: { HOME: 1.6, DRAW: 3.84, AWAY: 5.4 } },
    ],
    oddsOrigins: {
      AWAY: "Pinnacle",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.62, DRAW: 3.92, AWAY: 5.45 },
  },
  {
    id: "w1-004",
    fixtureSource: "Demo fixtures fallback",
    group: "Group C",
    kickoff: "2026-06-13T19:00:00Z",
    home: "Argentina",
    away: "Denmark",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Betfair", odds: { HOME: 1.75, DRAW: 3.62, AWAY: 4.88 } },
      { bookmaker: "Pinnacle", odds: { HOME: 1.72, DRAW: 3.58, AWAY: 4.79 } },
      { bookmaker: "Bet365", odds: { HOME: 1.71, DRAW: 3.55, AWAY: 4.74 } },
    ],
    oddsOrigins: {
      AWAY: "Betfair",
      DRAW: "Betfair",
      HOME: "Betfair",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.75, DRAW: 3.62, AWAY: 4.88 },
  },
  {
    id: "w2-001",
    fixtureSource: "Demo fixtures fallback",
    group: "Group D",
    kickoff: "2026-06-18T18:00:00Z",
    home: "Spain",
    away: "South Korea",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 1.81, DRAW: 3.48, AWAY: 4.72 } },
      { bookmaker: "Bet365", odds: { HOME: 1.79, DRAW: 3.44, AWAY: 4.6 } },
      { bookmaker: "Betfair", odds: { HOME: 1.8, DRAW: 3.41, AWAY: 4.67 } },
    ],
    oddsOrigins: {
      AWAY: "Pinnacle",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.81, DRAW: 3.48, AWAY: 4.72 },
  },
  {
    id: "w2-002",
    fixtureSource: "Demo fixtures fallback",
    group: "Group E",
    kickoff: "2026-06-19T17:00:00Z",
    home: "France",
    away: "Switzerland",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Bet365", odds: { HOME: 1.7, DRAW: 3.74, AWAY: 5.1 } },
      { bookmaker: "Pinnacle", odds: { HOME: 1.69, DRAW: 3.7, AWAY: 5.04 } },
      { bookmaker: "Betfair", odds: { HOME: 1.68, DRAW: 3.68, AWAY: 5.02 } },
    ],
    oddsOrigins: {
      AWAY: "Bet365",
      DRAW: "Bet365",
      HOME: "Bet365",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.7, DRAW: 3.74, AWAY: 5.1 },
  },
  {
    id: "w2-003",
    fixtureSource: "Demo fixtures fallback",
    group: "Group F",
    kickoff: "2026-06-20T20:00:00Z",
    home: "England",
    away: "Croatia",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Betfair", odds: { HOME: 1.94, DRAW: 3.31, AWAY: 4.26 } },
      { bookmaker: "Pinnacle", odds: { HOME: 1.92, DRAW: 3.28, AWAY: 4.18 } },
      { bookmaker: "Bet365", odds: { HOME: 1.9, DRAW: 3.24, AWAY: 4.1 } },
    ],
    oddsOrigins: {
      AWAY: "Betfair",
      DRAW: "Betfair",
      HOME: "Betfair",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 1.94, DRAW: 3.31, AWAY: 4.26 },
  },
  {
    id: "w2-004",
    fixtureSource: "Demo fixtures fallback",
    group: "Group G",
    kickoff: "2026-06-21T20:00:00Z",
    home: "Portugal",
    away: "Uruguay",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 2.28, DRAW: 3.12, AWAY: 3.18 } },
      { bookmaker: "Bet365", odds: { HOME: 2.24, DRAW: 3.08, AWAY: 3.14 } },
      { bookmaker: "Betfair", odds: { HOME: 2.26, DRAW: 3.06, AWAY: 3.16 } },
    ],
    oddsOrigins: {
      AWAY: "Pinnacle",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.28, DRAW: 3.12, AWAY: 3.18 },
  },
  {
    id: "w3-001",
    fixtureSource: "Demo fixtures fallback",
    group: "Group H",
    kickoff: "2026-06-26T18:00:00Z",
    home: "Germany",
    away: "Belgium",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Bet365", odds: { HOME: 2.15, DRAW: 3.2, AWAY: 3.42 } },
      { bookmaker: "Pinnacle", odds: { HOME: 2.11, DRAW: 3.18, AWAY: 3.36 } },
      { bookmaker: "Betfair", odds: { HOME: 2.13, DRAW: 3.16, AWAY: 3.4 } },
    ],
    oddsOrigins: {
      AWAY: "Bet365",
      DRAW: "Bet365",
      HOME: "Bet365",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.15, DRAW: 3.2, AWAY: 3.42 },
  },
  {
    id: "w3-002",
    fixtureSource: "Demo fixtures fallback",
    group: "Group I",
    kickoff: "2026-06-27T17:00:00Z",
    home: "Italy",
    away: "Colombia",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 2.02, DRAW: 3.18, AWAY: 4.02 } },
      { bookmaker: "Bet365", odds: { HOME: 1.99, DRAW: 3.14, AWAY: 3.95 } },
      { bookmaker: "Betfair", odds: { HOME: 2.0, DRAW: 3.12, AWAY: 3.98 } },
    ],
    oddsOrigins: {
      AWAY: "Pinnacle",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.02, DRAW: 3.18, AWAY: 4.02 },
  },
  {
    id: "w3-003",
    fixtureSource: "Demo fixtures fallback",
    group: "Group J",
    kickoff: "2026-06-28T19:00:00Z",
    home: "Morocco",
    away: "Canada",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Betfair", odds: { HOME: 2.42, DRAW: 3.02, AWAY: 2.98 } },
      { bookmaker: "Pinnacle", odds: { HOME: 2.4, DRAW: 3.0, AWAY: 2.95 } },
      { bookmaker: "Bet365", odds: { HOME: 2.36, DRAW: 2.96, AWAY: 2.92 } },
    ],
    oddsOrigins: {
      AWAY: "Betfair",
      DRAW: "Betfair",
      HOME: "Betfair",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.42, DRAW: 3.02, AWAY: 2.98 },
  },
  {
    id: "w3-004",
    fixtureSource: "Demo fixtures fallback",
    group: "Group K",
    kickoff: "2026-06-29T20:00:00Z",
    home: "Japan",
    away: "USA",
    oddsDetail: "Best demo prices from a fake bookmaker set.",
    bookmaker: "Demo market",
    bookmakerCount: 3,
    quotes: [
      { bookmaker: "Pinnacle", odds: { HOME: 2.66, DRAW: 3.08, AWAY: 2.74 } },
      { bookmaker: "Bet365", odds: { HOME: 2.62, DRAW: 3.04, AWAY: 2.7 } },
      { bookmaker: "Betfair", odds: { HOME: 2.64, DRAW: 3.02, AWAY: 2.72 } },
    ],
    oddsOrigins: {
      AWAY: "Pinnacle",
      DRAW: "Pinnacle",
      HOME: "Pinnacle",
    },
    oddsSource: "Demo odds fallback",
    odds: { HOME: 2.66, DRAW: 3.08, AWAY: 2.74 },
  },
];

function clampToOdds(value) {
  return Number(value.toFixed(2));
}

function buildDemoTotals(match, index) {
  const favoritePrice = Math.min(match.odds.HOME ?? 2.2, match.odds.AWAY ?? 2.2);
  const line = favoritePrice <= 1.78 || index % 4 === 0 ? 3.5 : 2.5;
  const overPrice = clampToOdds(1.78 + (index % 3) * 0.07 + (favoritePrice <= 1.78 ? 0.04 : 0));
  const underPrice = clampToOdds(1.88 + ((index + 1) % 3) * 0.06);

  return {
    OVER: overPrice,
    UNDER: underPrice,
    point: line,
  };
}

function buildDemoQuoteTotals(totals, quoteIndex) {
  return {
    OVER: clampToOdds(totals.OVER - quoteIndex * 0.03),
    UNDER: clampToOdds(totals.UNDER - quoteIndex * 0.02),
    point: totals.point,
  };
}

export const demoMatches = rawDemoMatches.map((match, matchIndex) => {
  const totals = buildDemoTotals(match, matchIndex);

  return {
    ...match,
    quotes: (match.quotes ?? []).map((quote, quoteIndex) => ({
      ...quote,
      totals: buildDemoQuoteTotals(totals, quoteIndex),
    })),
    totals,
    totalsDetail: `Demo total goals market at ${totals.point.toFixed(1)}.`,
    totalsOrigins: {
      OVER: match.quotes?.[0]?.bookmaker ?? match.bookmaker,
      UNDER: match.quotes?.[0]?.bookmaker ?? match.bookmaker,
    },
  };
});
