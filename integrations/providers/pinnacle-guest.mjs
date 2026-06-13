const publicConfigUrl = "https://www.pinnacle.com/config/app.json";

export const defaultPinnacleGuestConfig = {
  apiKey: "CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R",
  apiVersion: "0.1",
  guestRoot: "https://guest.api.arcadia.pinnacle.com",
  leagueId: 2686,
};

function roundOdds(value) {
  return Math.round(value * 100) / 100;
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugSelection(value) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "SELECTION";
}

function firstConfiguredGuestRoute(routes = {}) {
  return (
    routes.nolicense ||
    routes.curacao ||
    Object.values(routes).find((entry) => entry?.guestRoot) ||
    null
  );
}

function participantNameMap(matchup) {
  return new Map((matchup?.participants ?? []).map((participant) => [participant.id, participant.name]));
}

function participantName(matchup, alignment) {
  return matchup?.participants?.find((participant) => participant.alignment === alignment)?.name ?? null;
}

function findMarket(markets, predicate) {
  return markets.find(predicate) ?? null;
}

function decimalFromPrice(price) {
  const american = Number(price);
  if (!Number.isFinite(american) || american === 0) {
    return null;
  }

  if (american > 0) {
    return roundOdds(1 + american / 100);
  }

  return roundOdds(1 + 100 / Math.abs(american));
}

function normalizeBinaryParticipantName(name) {
  const normalized = normalizeLookupText(name);
  if (normalized === "yes") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  return null;
}

function normalizeSpecialParticipantOptions(matchup, markets) {
  const market = Array.isArray(markets) ? markets[0] : null;
  if (!matchup || !market?.prices?.length) {
    return [];
  }

  const names = participantNameMap(matchup);

  return market.prices
    .map((price) => {
      const label = names.get(price.participantId);
      const odds = decimalFromPrice(price.price);
      if (!label || !odds) {
        return null;
      }

      return {
        label,
        odds,
        participantId: price.participantId,
      };
    })
    .filter(Boolean);
}

function normalizeMoneylineQuote(market, homeTeam, awayTeam) {
  const prices = market?.prices ?? [];

  const home = decimalFromPrice(prices.find((item) => item.designation === "home")?.price);
  const away = decimalFromPrice(prices.find((item) => item.designation === "away")?.price);
  const draw = decimalFromPrice(prices.find((item) => item.designation === "draw")?.price);

  return {
    AWAY: away,
    DRAW: draw,
    HOME: home,
  };
}

function normalizeTotalsQuote(market) {
  const overPrice = market?.prices?.find((item) => item.designation === "over");
  const underPrice = market?.prices?.find((item) => item.designation === "under");
  const point = Number(overPrice?.points ?? underPrice?.points);

  return {
    OVER: decimalFromPrice(overPrice?.price),
    UNDER: decimalFromPrice(underPrice?.price),
    point: Number.isFinite(point) ? point : null,
  };
}

function normalizePlayerBookedOptions(matchup, markets) {
  return normalizeSpecialParticipantOptions(matchup, markets)
    .map((option) => ({
      label: `${option.label} to be booked`,
      odds: option.odds,
      origin: "Pinnacle",
      playerName: option.label,
      selection: `${slugSelection(option.label)}|BOOKED`,
    }))
    .sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label));
}

function normalizeRedCardMarket(matchup, markets) {
  const options = normalizeSpecialParticipantOptions(matchup, markets);
  const record = { NO: null, YES: null };

  options.forEach((option) => {
    const selection = normalizeBinaryParticipantName(option.label);
    if (selection) {
      record[selection] = option.odds;
    }
  });

  if (!record.YES && !record.NO) {
    return null;
  }

  return record;
}

function futureMarketType(matchup) {
  const text = normalizeLookupText([matchup?.special?.category, matchup?.special?.description].join(" "));

  if (/world cup 2026 winner|world cup winner/.test(text)) {
    return "future_winner";
  }

  if (/tournament top goalscorer|top goalscorer|top scorer|golden boot/.test(text)) {
    return "future_top_scorer";
  }

  return null;
}

function futureSubtitle(marketType) {
  return marketType === "future_winner"
    ? "Pick the country that lifts the trophy."
    : "Pick the player who finishes with the most goals.";
}

function futureTitle(marketType) {
  return marketType === "future_winner" ? "World Cup winner" : "Top scorer";
}

export async function loadPinnaclePublicApiConfig() {
  const response = await fetch(publicConfigUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Pinnacle public config failed with ${response.status}`);
  }

  const data = await response.json();
  const haywire = data?.api?.haywire ?? {};
  const route = firstConfiguredGuestRoute(haywire.routes ?? {});

  return {
    apiKey: haywire.apiKey || defaultPinnacleGuestConfig.apiKey,
    apiVersion: String(haywire.apiVersion || defaultPinnacleGuestConfig.apiVersion),
    guestRoot: route?.guestRoot || defaultPinnacleGuestConfig.guestRoot,
  };
}

export function buildPinnacleGuestRequest({
  apiVersion = defaultPinnacleGuestConfig.apiVersion,
  guestRoot = defaultPinnacleGuestConfig.guestRoot,
  path,
}) {
  const cleanRoot = String(guestRoot || defaultPinnacleGuestConfig.guestRoot).replace(/\/+$/g, "");
  const cleanVersion = String(apiVersion || defaultPinnacleGuestConfig.apiVersion).replace(/^\/+|\/+$/g, "");
  const cleanPath = String(path || "").replace(/^\/+/g, "");
  return `${cleanRoot}/${cleanVersion}/${cleanPath}`;
}

export async function fetchPinnacleGuestJson(url, apiKey = defaultPinnacleGuestConfig.apiKey) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Origin: "https://www.pinnacle.com",
      Referer: "https://www.pinnacle.com/",
      "User-Agent": "Mozilla/5.0",
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Pinnacle guest request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function normalizePinnacleMatchOdds({
  matchup,
  markets = [],
  playerBookedMatchup = null,
  playerBookedMarkets = [],
  redCardMatchup = null,
  redCardMarkets = [],
}) {
  const home = participantName(matchup, "home");
  const away = participantName(matchup, "away");
  const moneyline = findMarket(markets, (market) => market.type === "moneyline" && market.period === 0 && !market.isAlternate);
  const total = findMarket(markets, (market) => market.type === "total" && market.period === 0 && !market.isAlternate);
  const odds = normalizeMoneylineQuote(moneyline, home, away);
  const totals = normalizeTotalsQuote(total);
  const playerBookedOptions = normalizePlayerBookedOptions(playerBookedMatchup, playerBookedMarkets);
  const redCards = normalizeRedCardMarket(redCardMatchup, redCardMarkets);

  return {
    away,
    bookmaker: "Pinnacle",
    bookmakerCount: 1,
    home,
    kickoff: matchup?.startTime ?? null,
    odds,
    oddsOrigins: { AWAY: "Pinnacle", DRAW: "Pinnacle", HOME: "Pinnacle" },
    oddsSource: "Pinnacle",
    playerBookedOptions,
    playerPropsDetail: playerBookedOptions.length ? "Live player booking coefficients from Pinnacle." : null,
    providerEventId: matchup?.id,
    quotes: [
      {
        bookmaker: "Pinnacle",
        lastUpdate: null,
        odds,
        totals,
      },
    ],
    redCards,
    redCardsDetail: redCards ? "Live red-card coefficients from Pinnacle." : null,
    redCardsOrigins: redCards ? { NO: "Pinnacle", YES: "Pinnacle" } : null,
    sportTitle: matchup?.league?.name ?? "FIFA - World Cup",
    status: matchup?.status ?? "pending",
    totals,
    totalsOrigins: {
      OVER: totals.OVER ? "Pinnacle" : null,
      UNDER: totals.UNDER ? "Pinnacle" : null,
    },
  };
}

export function normalizePinnacleFutureMarket({ matchup, markets = [] }) {
  const marketType = futureMarketType(matchup);
  if (!marketType) {
    return null;
  }

  const options = normalizeSpecialParticipantOptions(matchup, markets)
    .map((option) => ({
      label: option.label,
      odds: option.odds,
      origin: "Pinnacle",
      selection: slugSelection(option.label),
    }))
    .sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label));

  if (!options.length) {
    return null;
  }

  return {
    bookmaker: "Pinnacle",
    bookmakerCount: 1,
    id: marketType === "future_winner" ? "future-world-cup-winner" : "future-top-scorer",
    kickoff: matchup?.startTime ?? null,
    marketType,
    oddsDetail: `Live ${marketType === "future_winner" ? "teams" : "players"} board with ${options.length} options from Pinnacle.`,
    oddsSource: "Pinnacle",
    options,
    resultSelection: null,
    status: "SCHEDULED",
    subtitle: futureSubtitle(marketType),
    title: futureTitle(marketType),
  };
}
