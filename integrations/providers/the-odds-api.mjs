const baseUrl = "https://api.the-odds-api.com/v4";

const COMMON_NATIONAL_TEAMS = new Set(
  [
    "Argentina",
    "Australia",
    "Austria",
    "Belgium",
    "Bolivia",
    "Bosnia and Herzegovina",
    "Brazil",
    "Bulgaria",
    "Cameroon",
    "Canada",
    "Chile",
    "China",
    "Colombia",
    "Costa Rica",
    "Croatia",
    "Czech Republic",
    "Czechia",
    "Denmark",
    "Ecuador",
    "Egypt",
    "England",
    "France",
    "Germany",
    "Ghana",
    "Greece",
    "Hungary",
    "Iran",
    "Iraq",
    "Ireland",
    "Israel",
    "Italy",
    "Ivory Coast",
    "Jamaica",
    "Japan",
    "Mexico",
    "Morocco",
    "Netherlands",
    "New Zealand",
    "Nigeria",
    "North Korea",
    "Norway",
    "Panama",
    "Paraguay",
    "Peru",
    "Poland",
    "Portugal",
    "Romania",
    "Saudi Arabia",
    "Scotland",
    "Senegal",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "South Africa",
    "South Korea",
    "Spain",
    "Sweden",
    "Switzerland",
    "Tunisia",
    "Turkey",
    "Ukraine",
    "United States",
    "Uruguay",
    "Venezuela",
    "Wales",
  ].map((item) => normalizeLookupText(item)),
);

function mostCommonPoint(points) {
  const counts = new Map();

  points.forEach((point) => {
    const key = Number(point);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
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

function extractOutcomeLabel(outcome) {
  return String(outcome?.description || outcome?.name || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function futureContextText(bucket) {
  return normalizeLookupText(
    [
      bucket.eventTitle,
      bucket.eventName,
      bucket.eventDescription,
      bucket.marketTitle,
      bucket.marketName,
      bucket.marketDescription,
      bucket.marketKey,
      bucket.sportKey,
      bucket.sportTitle,
    ].join(" "),
  );
}

function isWorldCupFutureBucket(bucket) {
  const text = futureContextText(bucket);
  const looksLikeWorldCup = /fifa world cup|world cup/.test(text);
  const looksLikeFinals = !/(qualifiers|qualifier|women|womens|friendly|club world cup)/.test(text);
  return looksLikeWorldCup && looksLikeFinals;
}

function optionLooksLikeTeam(label) {
  const normalized = normalizeLookupText(label);
  return Boolean(normalized) && COMMON_NATIONAL_TEAMS.has(normalized);
}

function optionLooksLikePlayer(label) {
  const normalized = normalizeLookupText(label);
  if (!normalized || optionLooksLikeTeam(label)) {
    return false;
  }

  return normalized.split(" ").length >= 2;
}

function inferFutureMarketType(bucket, forcedMarketType = null) {
  if (forcedMarketType) {
    return forcedMarketType;
  }

  if (!isWorldCupFutureBucket(bucket)) {
    return null;
  }

  const labels = bucket.options.map((option) => option.label);
  const teamLikeCount = labels.filter(optionLooksLikeTeam).length;
  const playerLikeCount = labels.filter(optionLooksLikePlayer).length;
  const text = futureContextText(bucket);

  if (/(top scorer|top goalscorer|golden boot|most goals|top goal scorer)/.test(text)) {
    return "future_top_scorer";
  }

  if (/(winner|champion|to win|lift the trophy)/.test(text)) {
    return "future_winner";
  }

  if (teamLikeCount >= Math.max(8, Math.ceil(labels.length * 0.45))) {
    return "future_winner";
  }

  if (playerLikeCount >= Math.max(5, Math.ceil(labels.length * 0.45))) {
    return "future_top_scorer";
  }

  if (/(world cup|outright)/.test(text) && teamLikeCount > playerLikeCount) {
    return "future_winner";
  }

  return null;
}

function buildOutrightBucketKey(rawEvent, market) {
  const eventId = rawEvent?.id || rawEvent?.key || rawEvent?.title || rawEvent?.name || "future-event";
  const marketId =
    market?.key || market?.title || market?.name || market?.description || rawEvent?.title || rawEvent?.name || "market";

  return `${eventId}::${marketId}`;
}

function createOutrightBucket(rawEvent, market) {
  return {
    bookmakerTitles: new Set(),
    eventDescription: rawEvent?.description ?? "",
    eventName: rawEvent?.name ?? "",
    eventTitle: rawEvent?.title ?? rawEvent?.sport_title ?? "",
    kickoff: rawEvent?.commence_time ?? null,
    marketDescription: market?.description ?? "",
    marketKey: market?.key ?? "",
    marketName: market?.name ?? "",
    marketTitle: market?.title ?? "",
    optionMap: new Map(),
    sportKey: rawEvent?.sport_key ?? "",
    sportTitle: rawEvent?.sport_title ?? "",
  };
}

function collectOutrightBuckets(rawPayload) {
  const rawEvents = Array.isArray(rawPayload) ? rawPayload : rawPayload ? [rawPayload] : [];
  const buckets = new Map();

  rawEvents.forEach((rawEvent) => {
    (rawEvent?.bookmakers ?? []).forEach((bookmaker) => {
      (bookmaker?.markets ?? []).forEach((market) => {
        const bucketKey = buildOutrightBucketKey(rawEvent, market);
        const bucket = buckets.get(bucketKey) ?? createOutrightBucket(rawEvent, market);
        bucket.bookmakerTitles.add(bookmaker?.title || bookmaker?.key || "Unknown bookmaker");
        if (!bucket.kickoff && rawEvent?.commence_time) {
          bucket.kickoff = rawEvent.commence_time;
        }

        (market?.outcomes ?? []).forEach((outcome) => {
          const label = extractOutcomeLabel(outcome);
          const odds = Number(outcome?.price);
          if (!label || !Number.isFinite(odds) || odds <= 0) {
            return;
          }

          const selection = slugSelection(label);
          const option = {
            label,
            odds,
            origin: bookmaker?.title || bookmaker?.key || "Unknown bookmaker",
            selection,
          };

          const existing = bucket.optionMap.get(selection);
          if (!existing || option.odds > existing.odds) {
            bucket.optionMap.set(selection, option);
          }
        });

        buckets.set(bucketKey, bucket);
      });
    });
  });

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    bookmakerTitles: Array.from(bucket.bookmakerTitles),
    options: Array.from(bucket.optionMap.values()).sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label)),
  }));
}

function mergeFutureOptions(leftOptions, rightOptions) {
  const optionMap = new Map();

  [...leftOptions, ...rightOptions].forEach((option) => {
    const existing = optionMap.get(option.selection);
    if (!existing || option.odds > existing.odds) {
      optionMap.set(option.selection, option);
    }
  });

  return Array.from(optionMap.values()).sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label));
}

function summarizeFutureOdds(marketType, options, bookmakerTitles) {
  const optionLabel = marketType === "future_winner" ? "teams" : "players";
  const bookmakerLabel =
    bookmakerTitles.length === 1 ? bookmakerTitles[0] : `${bookmakerTitles.length} bookmakers`;

  return `Live ${optionLabel} board with ${options.length} options from ${bookmakerLabel}.`;
}

function buildFutureMarket(bucket, marketType, defaultKickoff) {
  if (!isWorldCupFutureBucket(bucket)) {
    return null;
  }

  const bookmakerTitles = uniqueList(bucket.bookmakerTitles);
  const options = bucket.options ?? [];
  if (!options.length) {
    return null;
  }

  return {
    bookmaker: bookmakerTitles[0] ?? "No bookmaker yet",
    bookmakerCount: bookmakerTitles.length,
    id: marketType === "future_winner" ? "future-world-cup-winner" : "future-top-scorer",
    kickoff: bucket.kickoff ?? defaultKickoff,
    marketType,
    oddsDetail: summarizeFutureOdds(marketType, options, bookmakerTitles),
    oddsSource: "The Odds API",
    options,
    resultSelection: null,
    status: "SCHEDULED",
    subtitle:
      marketType === "future_winner"
        ? "Pick the country that lifts the trophy."
        : "Pick the player who finishes with the most goals.",
    title: marketType === "future_winner" ? "World Cup winner" : "Top scorer",
  };
}

function mergeFutureMarkets(existing, incoming) {
  const bookmakerTitles = uniqueList([existing.bookmaker, incoming.bookmaker]);
  const options = mergeFutureOptions(existing.options ?? [], incoming.options ?? []);

  return {
    ...existing,
    bookmaker: bookmakerTitles[0] ?? existing.bookmaker ?? incoming.bookmaker,
    bookmakerCount: Math.max(existing.bookmakerCount ?? 0, incoming.bookmakerCount ?? 0, bookmakerTitles.length),
    kickoff:
      new Date(existing.kickoff).getTime() <= new Date(incoming.kickoff).getTime() ? existing.kickoff : incoming.kickoff,
    oddsDetail: summarizeFutureOdds(existing.marketType, options, bookmakerTitles),
    options,
  };
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

export function buildTheOddsApiEventOddsRequest({
  apiKey,
  bookmaker = "",
  eventId,
  markets,
  oddsFormat = "decimal",
  region = "uk",
  sportKey,
}) {
  const url = new URL(`${baseUrl}/sports/${sportKey}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", oddsFormat);

  if (bookmaker) {
    url.searchParams.set("bookmakers", bookmaker);
  }

  return url.toString();
}

export function buildTheOddsApiSportsRequest({ apiKey, all = true }) {
  const url = new URL(`${baseUrl}/sports`);
  url.searchParams.set("apiKey", apiKey);
  if (all) {
    url.searchParams.set("all", "true");
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

function chooseBalancedAlternateTotal(outcomes) {
  const groupedByPoint = new Map();

  outcomes.forEach((outcome) => {
    const side = String(outcome?.name || "").trim().toUpperCase();
    const point = Number(outcome?.point);
    const price = Number(outcome?.price);

    if (!Number.isFinite(point) || !Number.isFinite(price) || price <= 0) {
      return;
    }

    if (side !== "OVER" && side !== "UNDER") {
      return;
    }

    const bucket = groupedByPoint.get(point) ?? { OVER: null, UNDER: null, point };
    bucket[side] = price;
    groupedByPoint.set(point, bucket);
  });

  return Array.from(groupedByPoint.values())
    .filter((bucket) => Number.isFinite(bucket.OVER) && Number.isFinite(bucket.UNDER))
    .sort((left, right) => {
      const leftBalance = Math.abs(left.OVER - left.UNDER);
      const rightBalance = Math.abs(right.OVER - right.UNDER);
      if (leftBalance !== rightBalance) {
        return leftBalance - rightBalance;
      }

      const leftMeanDistance = Math.abs((left.OVER + left.UNDER) / 2 - 1.95);
      const rightMeanDistance = Math.abs((right.OVER + right.UNDER) / 2 - 1.95);
      if (leftMeanDistance !== rightMeanDistance) {
        return leftMeanDistance - rightMeanDistance;
      }

      return left.point - right.point;
    })[0] ?? null;
}

export function normalizeTheOddsApiExtraMatchMarkets(rawEvent) {
  const bookmaker = rawEvent?.bookmakers?.[0];
  const bookmakerTitle = bookmaker?.title ?? bookmaker?.key ?? "Unknown bookmaker";
  const markets = bookmaker?.markets ?? [];

  const cardsMarket = markets.find((market) => market.key === "alternate_totals_cards");
  const selectedCardsLine = cardsMarket ? chooseBalancedAlternateTotal(cardsMarket.outcomes ?? []) : null;

  const playerBookedMarket = markets.find((market) => market.key === "player_to_receive_card");
  const playerBookedOptions = (playerBookedMarket?.outcomes ?? [])
    .filter((outcome) => String(outcome?.name || "").trim().toUpperCase() === "YES")
    .map((outcome) => {
      const playerName = extractOutcomeLabel(outcome);
      const odds = Number(outcome?.price);
      if (!playerName || !Number.isFinite(odds) || odds <= 0) {
        return null;
      }

      return {
        label: `${playerName} to be booked`,
        odds,
        origin: bookmakerTitle,
        playerName,
        selection: `${slugSelection(playerName)}|BOOKED`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label));

  return {
    playerBookedOptions,
    playerPropsDetail: playerBookedOptions.length
      ? `Live player booking coefficients from ${bookmakerTitle}.`
      : null,
    yellowCards: selectedCardsLine
      ? {
          OVER: selectedCardsLine.OVER,
          UNDER: selectedCardsLine.UNDER,
          point: selectedCardsLine.point,
        }
      : null,
    yellowCardsDetail: selectedCardsLine
      ? `Live yellow-card total from ${bookmakerTitle} at ${selectedCardsLine.point.toFixed(1)}.`
      : null,
    yellowCardsOrigins: selectedCardsLine
      ? {
          OVER: bookmakerTitle,
          UNDER: bookmakerTitle,
        }
      : null,
  };
}

export function normalizeTheOddsApiFuturePayload(rawPayload, { defaultKickoff, forcedMarketType = null } = {}) {
  const futuresByType = new Map();

  collectOutrightBuckets(rawPayload).forEach((bucket) => {
    const marketType = inferFutureMarketType(bucket, forcedMarketType);
    if (!marketType) {
      return;
    }

    const market = buildFutureMarket(bucket, marketType, defaultKickoff);
    if (!market) {
      return;
    }

    const existing = futuresByType.get(market.marketType);
    futuresByType.set(market.marketType, existing ? mergeFutureMarkets(existing, market) : market);
  });

  return Array.from(futuresByType.values());
}
