import http from "node:http";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFootballDataCompetitionFeed, fetchFootballDataJson, normalizeFootballDataMatch } from "./integrations/providers/football-data.mjs";
import {
  buildPinnacleGuestRequest,
  defaultPinnacleGuestConfig,
  fetchPinnacleGuestJson,
  loadPinnaclePublicApiConfig,
  normalizePinnacleFutureMarket,
  normalizePinnacleMatchOdds,
} from "./integrations/providers/pinnacle-guest.mjs";
import {
  buildTheOddsApiEventOddsRequest,
  buildTheOddsApiRequest,
  buildTheOddsApiSportsRequest,
  fetchTheOddsApiJson,
  normalizeTheOddsApiExtraMatchMarkets,
  normalizeTheOddsApiFuturePayload,
  normalizeTheOddsApiMatch,
} from "./integrations/providers/the-odds-api.mjs";
import { demoFutures, demoMatches, simpleConfig } from "./data/simple-app-data.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeEnv = loadRuntimeEnv();
const port = Number(runtimeEnv.PORT || 4173);
const host = runtimeEnv.HOST || "0.0.0.0";
const matchCacheTtlMs = Number(
  runtimeEnv.MATCH_CACHE_TTL_SECONDS || runtimeEnv.CACHE_TTL_SECONDS || simpleConfig.cacheTtlSeconds,
) * 1000;
const futureCacheTtlMs = Number(
  runtimeEnv.FUTURE_CACHE_TTL_SECONDS || simpleConfig.futureCacheTtlSeconds || runtimeEnv.CACHE_TTL_SECONDS || simpleConfig.cacheTtlSeconds,
) * 1000;
const eventMarketMatchLimit = Number(runtimeEnv.ODDS_API_EVENT_MARKET_MATCH_LIMIT || 6);
const oddsProviderId = String(runtimeEnv.ODDS_PROVIDER || "pinnacle_guest").toLowerCase();
const matchLookbackDays = Number(runtimeEnv.MATCH_LOOKBACK_DAYS || simpleConfig.matchLookbackDays);
const matchLookaheadDays = Number(runtimeEnv.MATCH_LOOKAHEAD_DAYS || simpleConfig.matchLookaheadDays);
const pinnacleWorldCupLeagueId = Number(runtimeEnv.PINNACLE_WORLD_CUP_LEAGUE_ID || defaultPinnacleGuestConfig.leagueId);
const tournamentSpecialsLockTime = runtimeEnv.TOURNAMENT_SPECIALS_LOCK_TIME || demoFutures[0]?.kickoff || "2026-07-01T12:00:00Z";
const futuresEnabled = String(runtimeEnv.ENABLE_FUTURES ?? "true").toLowerCase() !== "false";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const matchCache = {
  expiresAt: 0,
  pending: null,
  value: null,
};

const futureCache = {
  expiresAt: 0,
  pending: null,
  value: null,
};

const publicAppConfig = {
  futuresEnabled,
  siteName: "GoonBet",
  supabasePublishableKey: runtimeEnv.SUPABASE_PUBLISHABLE_KEY || runtimeEnv.SUPABASE_ANON_KEY || "",
  supabaseUrl: runtimeEnv.SUPABASE_URL || "",
};

function loadRuntimeEnv() {
  const envPath = path.join(rootDir, ".env");
  const parsed = {};

  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      parsed[key] = value;
    }
  } catch {
    // No local .env file is fine.
  }

  return {
    ...parsed,
    ...process.env,
  };
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

function canonicalTeamName(name) {
  const normalized = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|ac|sc|club|football)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = new Map([
    ["czech republic", "czechia"],
    ["ir iran", "iran"],
    ["korea republic", "south korea"],
    ["turkiye", "turkey"],
    ["usa", "united states"],
  ]);

  return aliases.get(normalized) ?? normalized;
}

function uniqueValues(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function explicitRuntimeSetting(key, fallback = "") {
  return Object.prototype.hasOwnProperty.call(runtimeEnv, key) ? runtimeEnv[key] : fallback;
}

function configuredValue(value, fallback) {
  return value == null || value === "" ? fallback : value;
}

function upcomingWindowMs() {
  return matchLookaheadDays * 24 * 60 * 60 * 1000;
}

function pinnacleMatchShouldBeLoaded(kickoff) {
  const time = new Date(kickoff).getTime();
  if (!Number.isFinite(time)) {
    return false;
  }

  const now = Date.now();
  const recentGraceMs = 4 * 60 * 60 * 1000;
  return time >= now - recentGraceMs && time <= now + upcomingWindowMs();
}

function isPinnacleBaseMatchup(matchup) {
  return (
    matchup?.type === "matchup" &&
    matchup?.parentId == null &&
    matchup?.hasMarkets &&
    matchup?.startTime &&
    pinnacleMatchShouldBeLoaded(matchup.startTime)
  );
}

function specialDescriptionText(matchup) {
  return normalizeLookupText([matchup?.special?.category, matchup?.special?.description].join(" "));
}

function participantNameLabel(matchup) {
  const home = matchup?.participants?.find((participant) => participant.alignment === "home")?.name ?? "Home";
  const away = matchup?.participants?.find((participant) => participant.alignment === "away")?.name ?? "Away";
  return `${home} vs ${away}`;
}

function indexPinnacleSpecialMatchups(rawMatchups) {
  const lookup = new Map();

  (rawMatchups ?? [])
    .filter((matchup) => matchup?.type === "special" && matchup?.parentId)
    .forEach((matchup) => {
      const existing = lookup.get(matchup.parentId) ?? {};
      const description = specialDescriptionText(matchup);

      if (description.includes("player to be booked")) {
        existing.playerBooked = matchup;
      } else if (description.includes("either team to get a red card")) {
        existing.redCards = matchup;
      }

      lookup.set(matchup.parentId, existing);
    });

  return lookup;
}

function discoverPinnacleFutureMatchups(rawMatchups) {
  const futures = {
    topScorer: null,
    winner: null,
  };

  (rawMatchups ?? [])
    .filter((matchup) => matchup?.type === "special" && !matchup?.parentId)
    .forEach((matchup) => {
      const description = specialDescriptionText(matchup);
      if (!futures.winner && /world cup 2026 winner|world cup winner/.test(description)) {
        futures.winner = matchup;
      } else if (!futures.topScorer && /tournament top goalscorer|top goalscorer|top scorer|golden boot/.test(description)) {
        futures.topScorer = matchup;
      }
    });

  return futures;
}

async function resolvePinnacleGuestConfig(notes = []) {
  const manualApiKey = runtimeEnv.PINNACLE_API_KEY || runtimeEnv.PINNACLE_PUBLIC_API_KEY || "";
  const manualApiVersion = runtimeEnv.PINNACLE_API_VERSION || "";
  const manualGuestRoot = runtimeEnv.PINNACLE_GUEST_ROOT || "";
  let discovered = defaultPinnacleGuestConfig;

  if (String(runtimeEnv.PINNACLE_USE_PUBLIC_CONFIG ?? "true").toLowerCase() !== "false") {
    try {
      discovered = {
        ...discovered,
        ...(await loadPinnaclePublicApiConfig()),
      };
    } catch (error) {
      notes.push(`Pinnacle public config fallback used: ${error.message}.`);
    }
  }

  return {
    apiKey: configuredValue(manualApiKey, discovered.apiKey),
    apiVersion: configuredValue(manualApiVersion, discovered.apiVersion),
    guestRoot: configuredValue(manualGuestRoot, discovered.guestRoot),
  };
}

async function fetchPinnacleLeagueMatchups(config) {
  const url = buildPinnacleGuestRequest({
    apiVersion: config.apiVersion,
    guestRoot: config.guestRoot,
    path: `leagues/${pinnacleWorldCupLeagueId}/matchups`,
  });

  const data = await fetchPinnacleGuestJson(url, config.apiKey);
  return Array.isArray(data) ? data : [];
}

async function fetchPinnacleMatchupMarkets(matchupId, config) {
  const url = buildPinnacleGuestRequest({
    apiVersion: config.apiVersion,
    guestRoot: config.guestRoot,
    path: `matchups/${matchupId}/markets/straight`,
  });

  const data = await fetchPinnacleGuestJson(url, config.apiKey);
  return Array.isArray(data) ? data : [];
}

function futureKeyCandidates(marketType, baseSportKey) {
  if (marketType === "future_winner") {
    return uniqueValues([
      runtimeEnv.ODDS_API_WINNER_SPORT_KEY,
      `${baseSportKey}_winner`,
      `${baseSportKey}_outrights`,
      "soccer_fifa_world_cup_winner",
      "soccer_fifa_world_cup_outrights",
    ]);
  }

  return uniqueValues([
    runtimeEnv.ODDS_API_TOP_SCORER_SPORT_KEY,
    `${baseSportKey}_top_scorer`,
    `${baseSportKey}_top_goalscorer`,
    `${baseSportKey}_golden_boot`,
    "soccer_fifa_world_cup_top_scorer",
    "soccer_fifa_world_cup_top_goalscorer",
    "soccer_fifa_world_cup_golden_boot",
  ]);
}

function futureDiscoveryScore(sport, marketType, baseSportKey) {
  const sportKey = String(sport?.key || "");
  const text = normalizeLookupText([sport?.key, sport?.title, sport?.description].join(" "));
  const normalizedBase = normalizeLookupText(baseSportKey).replace(/\s+/g, "_");
  const isWorldCupFamily =
    sportKey === baseSportKey ||
    (sportKey.startsWith(`${baseSportKey}_`) && !/_qualifiers_|_women|_womens|_friendly|_club_/.test(sportKey));
  let score = 0;

  if (!isWorldCupFamily) {
    return 0;
  }

  if (sport?.active) {
    score += 1;
  }

  if (sport?.has_outrights) {
    score += 2;
  }

  if (sportKey.includes(baseSportKey) || text.includes(normalizedBase.replaceAll("_", " "))) {
    score += 4;
  }

  if (text.includes("world cup")) {
    score += 3;
  }

  if (marketType === "future_winner" && /(winner|champion|outright|to win)/.test(text)) {
    score += 5;
  }

  if (marketType === "future_top_scorer" && /(top scorer|top goalscorer|golden boot|most goals|goal scorer)/.test(text)) {
    score += 6;
  }

  return score;
}

function discoverFutureSportKeys(sports, marketType, baseSportKey) {
  const catalogKeys = (sports ?? [])
    .map((sport) => ({
      key: sport?.key,
      score: futureDiscoveryScore(sport, marketType, baseSportKey),
    }))
    .filter((item) => item.key && item.score >= 5)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.key);

  return uniqueValues([...futureKeyCandidates(marketType, baseSportKey), ...catalogKeys]);
}

function startOfWeekUtc(input) {
  const date = new Date(input);
  const day = date.getUTCDay() || 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date;
}

function toIsoDate(input) {
  return input.toISOString().slice(0, 10);
}

function weekInfo(kickoff) {
  const start = startOfWeekUtc(kickoff);
  return {
    weekId: toIsoDate(start),
    weekLabel: `Week of ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(start)}`,
  };
}

function kickoffDistanceMs(left, right) {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime());
}

function currentDateRange() {
  const today = new Date();
  const past = new Date();
  const future = new Date();
  past.setUTCDate(today.getUTCDate() - matchLookbackDays);
  future.setUTCDate(today.getUTCDate() + matchLookaheadDays);
  return {
    dateFrom: toIsoDate(past),
    dateTo: toIsoDate(future),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(payload);
}

function sendScript(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/javascript; charset=utf-8",
  });
  response.end(payload);
}

function resolveRequestPath(urlPath) {
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  return path.resolve(rootDir, `.${requestedPath}`);
}

async function loadFixtureFeed() {
  const { dateFrom, dateTo } = currentDateRange();
  const notes = [];

  if (runtimeEnv.FOOTBALL_DATA_API_TOKEN) {
    try {
      const feed = buildFootballDataCompetitionFeed({
        competitionCode: runtimeEnv.FOOTBALL_DATA_COMPETITION || "WC",
        dateFrom,
        dateTo,
      });
      const data = await fetchFootballDataJson(feed.competitionMatches, runtimeEnv.FOOTBALL_DATA_API_TOKEN);
      const matches = (data.matches ?? []).map(normalizeFootballDataMatch);

      return {
        provider: "football-data.org",
        matches,
        notes,
      };
    } catch (error) {
      notes.push(`football-data.org failed: ${error.message}.`);
    }
  } else {
    notes.push("FOOTBALL_DATA_API_TOKEN is not configured.");
  }

  return {
    provider: simpleConfig.fallbackFixtureSourceLabel,
    matches: [],
    notes,
  };
}

async function loadTheOddsApiOddsFeed() {
  const notes = [];

  if (!runtimeEnv.THE_ODDS_API_KEY) {
    notes.push("THE_ODDS_API_KEY is not configured.");
    return {
      provider: simpleConfig.fallbackOddsSourceLabel,
      matches: [],
      notes,
    };
  }

  try {
    const url = buildTheOddsApiRequest({
      apiKey: runtimeEnv.THE_ODDS_API_KEY,
      bookmaker: runtimeEnv.ODDS_API_BOOKMAKERS || "",
      market: "h2h,totals",
      oddsFormat: "decimal",
      region: runtimeEnv.ODDS_API_REGIONS || "eu",
      sportKey: runtimeEnv.ODDS_API_SPORT_KEY || "soccer_fifa_world_cup",
    });

    const data = await fetchTheOddsApiJson(url);
    const matches = (data ?? []).map(normalizeTheOddsApiMatch);
    const enrichedMatches = await enrichMatchesWithEventMarkets(matches, notes);

    return {
      provider: "The Odds API",
      matches: enrichedMatches,
      notes,
    };
  } catch (error) {
    notes.push(`The Odds API failed: ${error.message}.`);
    return {
      provider: simpleConfig.fallbackOddsSourceLabel,
      matches: [],
      notes,
    };
  }
}

async function loadPinnacleGuestOddsFeed() {
  const notes = [];

  try {
    const config = await resolvePinnacleGuestConfig(notes);
    const rawMatchups = await fetchPinnacleLeagueMatchups(config);
    const specialsByParentId = indexPinnacleSpecialMatchups(rawMatchups);
    const baseMatchups = rawMatchups.filter(isPinnacleBaseMatchup);

    const settledMatches = await Promise.all(
      baseMatchups.map(async (matchup) => {
        const specials = specialsByParentId.get(matchup.id) ?? {};
        const [mainResult, playerBookedResult, redCardResult] = await Promise.allSettled([
          fetchPinnacleMatchupMarkets(matchup.id, config),
          specials.playerBooked ? fetchPinnacleMatchupMarkets(specials.playerBooked.id, config) : Promise.resolve([]),
          specials.redCards ? fetchPinnacleMatchupMarkets(specials.redCards.id, config) : Promise.resolve([]),
        ]);

        if (mainResult.status !== "fulfilled") {
          notes.push(`${participantNameLabel(matchup)} Pinnacle price fetch failed: ${mainResult.reason?.message || mainResult.reason}.`);
          return null;
        }

        if (playerBookedResult.status !== "fulfilled" && specials.playerBooked) {
          notes.push(`${participantNameLabel(matchup)} Pinnacle player-booking fetch failed: ${playerBookedResult.reason?.message || playerBookedResult.reason}.`);
        }

        if (redCardResult.status !== "fulfilled" && specials.redCards) {
          notes.push(`${participantNameLabel(matchup)} Pinnacle red-card fetch failed: ${redCardResult.reason?.message || redCardResult.reason}.`);
        }

        return normalizePinnacleMatchOdds({
          matchup,
          markets: mainResult.value,
          playerBookedMatchup: specials.playerBooked ?? null,
          playerBookedMarkets: playerBookedResult.status === "fulfilled" ? playerBookedResult.value : [],
          redCardMatchup: specials.redCards ?? null,
          redCardMarkets: redCardResult.status === "fulfilled" ? redCardResult.value : [],
        });
      }),
    );

    return {
      provider: "Pinnacle",
      matches: settledMatches.filter(Boolean),
      notes,
    };
  } catch (error) {
    notes.push(`Pinnacle guest feed failed: ${error.message}.`);
    return {
      provider: simpleConfig.fallbackOddsSourceLabel,
      matches: [],
      notes,
    };
  }
}

async function loadOddsFeed() {
  if (oddsProviderId === "the_odds_api") {
    const primary = await loadTheOddsApiOddsFeed();
    if (primary.matches.length || !primary.notes.length) {
      return primary;
    }

    const fallback = await loadPinnacleGuestOddsFeed();
    return {
      ...fallback,
      notes: [...primary.notes, ...fallback.notes],
    };
  }

  const primary = await loadPinnacleGuestOddsFeed();
  if (primary.matches.length) {
    return primary;
  }

  if (runtimeEnv.THE_ODDS_API_KEY) {
    const fallback = await loadTheOddsApiOddsFeed();
    return {
      provider: fallback.matches.length ? fallback.provider : primary.provider,
      matches: fallback.matches.length ? fallback.matches : primary.matches,
      notes: [...primary.notes, ...fallback.notes],
    };
  }

  return primary;
}

function upcomingExtraMarketTargets(matches) {
  const now = Date.now();

  return matches
    .filter((match) => match?.providerEventId && new Date(match.kickoff).getTime() > now)
    .sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff))
    .slice(0, Math.max(0, eventMarketMatchLimit));
}

async function enrichMatchesWithEventMarkets(matches, notes) {
  const targets = upcomingExtraMarketTargets(matches);

  if (!targets.length) {
    return matches;
  }

  const extrasByEventId = new Map();

  for (const target of targets) {
    try {
      const url = buildTheOddsApiEventOddsRequest({
        apiKey: runtimeEnv.THE_ODDS_API_KEY,
        bookmaker: runtimeEnv.ODDS_API_BOOKMAKERS || "",
        eventId: target.providerEventId,
        markets: "alternate_totals_cards,player_to_receive_card",
        oddsFormat: "decimal",
        region: runtimeEnv.ODDS_API_REGIONS || "eu",
        sportKey: runtimeEnv.ODDS_API_SPORT_KEY || "soccer_fifa_world_cup",
      });

      const rawEvent = await fetchTheOddsApiJson(url);
      extrasByEventId.set(target.providerEventId, normalizeTheOddsApiExtraMatchMarkets(rawEvent));
    } catch (error) {
      notes.push(`${target.home} vs ${target.away} event markets failed: ${error.message}.`);
    }
  }

  return matches.map((match) => ({
    ...match,
    ...(extrasByEventId.get(match.providerEventId) ?? {}),
  }));
}

async function loadOddsSportsCatalog() {
  const url = buildTheOddsApiSportsRequest({
    apiKey: runtimeEnv.THE_ODDS_API_KEY,
    all: true,
  });

  const data = await fetchTheOddsApiJson(url);
  return Array.isArray(data) ? data : [];
}

function mergeFutureCollections(existingMarkets, incomingMarkets) {
  const merged = new Map(existingMarkets.map((market) => [market.marketType, market]));

  incomingMarkets.forEach((market) => {
    const existing = merged.get(market.marketType);
    if (!existing) {
      merged.set(market.marketType, market);
      return;
    }

    const optionMap = new Map();
    [...existing.options, ...market.options].forEach((option) => {
      const current = optionMap.get(option.selection);
      if (!current || option.odds > current.odds) {
        optionMap.set(option.selection, option);
      }
    });

    const options = Array.from(optionMap.values()).sort((left, right) => left.odds - right.odds || left.label.localeCompare(right.label));
    merged.set(market.marketType, {
      ...existing,
      bookmakerCount: Math.max(existing.bookmakerCount ?? 0, market.bookmakerCount ?? 0),
      kickoff:
        new Date(existing.kickoff).getTime() <= new Date(market.kickoff).getTime() ? existing.kickoff : market.kickoff,
      oddsDetail: market.oddsDetail || existing.oddsDetail,
      options,
    });
  });

  return Array.from(merged.values());
}

async function fetchFutureMarketsForSport(sportKey, forcedMarketType = null) {
  const url = buildTheOddsApiRequest({
    apiKey: runtimeEnv.THE_ODDS_API_KEY,
    bookmaker: explicitRuntimeSetting("ODDS_API_FUTURES_BOOKMAKERS", runtimeEnv.ODDS_API_BOOKMAKERS || ""),
    market: "outrights",
    oddsFormat: "decimal",
    region: explicitRuntimeSetting("ODDS_API_FUTURES_REGIONS", runtimeEnv.ODDS_API_REGIONS || "eu"),
    sportKey,
  });

  const data = await fetchTheOddsApiJson(url);
  return normalizeTheOddsApiFuturePayload(data, {
    defaultKickoff: tournamentSpecialsLockTime,
    forcedMarketType,
  });
}

async function loadTheOddsApiFutureFeed() {
  const notes = [];

  if (!runtimeEnv.THE_ODDS_API_KEY) {
    notes.push("THE_ODDS_API_KEY is not configured.");
    return {
      markets: [],
      notes,
      provider: simpleConfig.fallbackOddsSourceLabel,
    };
  }

  const baseSportKey = runtimeEnv.ODDS_API_OUTRIGHTS_SPORT_KEY || runtimeEnv.ODDS_API_SPORT_KEY || "soccer_fifa_world_cup";
  let markets = [];

  try {
    markets = mergeFutureCollections(markets, await fetchFutureMarketsForSport(baseSportKey));
  } catch (error) {
    notes.push(`The Odds API outrights feed failed: ${error.message}.`);
  }

  const missingMarketTypes = ["future_winner", "future_top_scorer"].filter(
    (marketType) => !markets.some((market) => market.marketType === marketType),
  );

  if (missingMarketTypes.length) {
    try {
      const sportsCatalog = await loadOddsSportsCatalog();

      for (const marketType of missingMarketTypes) {
        const candidateKeys = discoverFutureSportKeys(sportsCatalog, marketType, baseSportKey).filter((key) => key !== baseSportKey);
        for (const sportKey of candidateKeys) {
          try {
            const discoveredMarkets = await fetchFutureMarketsForSport(sportKey, marketType);
            if (discoveredMarkets.length) {
              markets = mergeFutureCollections(markets, discoveredMarkets);
              break;
            }
          } catch (error) {
            notes.push(`${sportKey} failed for ${marketType}: ${error.message}.`);
          }
        }
      }
    } catch (error) {
      notes.push(`The Odds API sports catalog failed: ${error.message}.`);
    }
  }

  return {
    markets,
    notes,
    provider: "The Odds API",
  };
}

async function loadPinnacleGuestFutureFeed() {
  const notes = [];

  try {
    const config = await resolvePinnacleGuestConfig(notes);
    const rawMatchups = await fetchPinnacleLeagueMatchups(config);
    const futures = discoverPinnacleFutureMatchups(rawMatchups);
    const futureTargets = [futures.winner, futures.topScorer].filter(Boolean);

    const settledMarkets = await Promise.all(
      futureTargets.map(async (matchup) => {
        try {
          const markets = await fetchPinnacleMatchupMarkets(matchup.id, config);
          return normalizePinnacleFutureMarket({ matchup, markets });
        } catch (error) {
          notes.push(`${matchup?.special?.description || "Pinnacle future"} failed: ${error.message}.`);
          return null;
        }
      }),
    );

    return {
      markets: settledMarkets.filter(Boolean),
      notes,
      provider: "Pinnacle",
    };
  } catch (error) {
    notes.push(`Pinnacle future feed failed: ${error.message}.`);
    return {
      markets: [],
      notes,
      provider: simpleConfig.fallbackOddsSourceLabel,
    };
  }
}

async function loadFutureFeed() {
  if (oddsProviderId === "the_odds_api") {
    const primary = await loadTheOddsApiFutureFeed();
    if (primary.markets.length || !primary.notes.length) {
      return primary;
    }

    const fallback = await loadPinnacleGuestFutureFeed();
    return {
      ...fallback,
      notes: [...primary.notes, ...fallback.notes],
    };
  }

  const primary = await loadPinnacleGuestFutureFeed();
  if (primary.markets.length) {
    return primary;
  }

  if (runtimeEnv.THE_ODDS_API_KEY) {
    const fallback = await loadTheOddsApiFutureFeed();
    return {
      markets: fallback.markets.length ? fallback.markets : primary.markets,
      notes: [...primary.notes, ...fallback.notes],
      provider: fallback.markets.length ? fallback.provider : primary.provider,
    };
  }

  return primary;
}

function bestOddsDetail(oddsMatch) {
  if (!oddsMatch) {
    return "No live bookmaker prices matched this fixture yet.";
  }

  const parts = ["HOME", "DRAW", "AWAY"]
    .map((selection) => {
      const label = selection === "HOME" ? "H" : selection === "DRAW" ? "D" : "A";
      const bookmaker = oddsMatch.oddsOrigins?.[selection];
      const odd = oddsMatch.odds?.[selection];
      if (!bookmaker || !odd) {
        return null;
      }
      return `${label}: ${bookmaker} ${odd.toFixed(2)}`;
    })
    .filter(Boolean);

  return parts.length ? `Best extracted coefficients - ${parts.join(" | ")}` : "No live bookmaker prices matched this fixture yet.";
}

function bestTotalsDetail(oddsMatch) {
  if (!oddsMatch?.totals?.point) {
    return "No live over/under total returned for this fixture yet.";
  }

  const parts = ["OVER", "UNDER"]
    .map((selection) => {
      const label = selection === "OVER" ? "O" : "U";
      const bookmaker = oddsMatch.totalsOrigins?.[selection];
      const odd = oddsMatch.totals?.[selection];
      if (!bookmaker || !odd) {
        return null;
      }
      return `${label}${oddsMatch.totals.point}: ${bookmaker} ${odd.toFixed(2)}`;
    })
    .filter(Boolean);

  return parts.length ? `Best total goals line - ${parts.join(" | ")}` : "No live over/under total returned for this fixture yet.";
}

function makeMatchRecord(base, oddsMatch) {
  const { weekId, weekLabel } = weekInfo(base.kickoff);

  return {
    id: base.id,
    fixtureSource: base.fixtureSource,
    group: base.group || base.stage || base.competition || "Upcoming",
    home: base.home,
    away: base.away,
    kickoff: base.kickoff,
    score: {
      home: Number.isFinite(base.homeScore) ? base.homeScore : null,
      away: Number.isFinite(base.awayScore) ? base.awayScore : null,
    },
    status: base.status ?? "SCHEDULED",
    oddsSource: oddsMatch?.oddsSource ?? simpleConfig.fallbackOddsSourceLabel,
    oddsDetail: bestOddsDetail(oddsMatch),
    oddsOrigins: oddsMatch?.oddsOrigins ?? { HOME: null, DRAW: null, AWAY: null },
    odds: oddsMatch?.odds ?? { HOME: null, DRAW: null, AWAY: null },
    bookmaker: oddsMatch?.bookmaker ?? "No bookmaker yet",
    bookmakerCount: oddsMatch?.bookmakerCount ?? 0,
    quotes: oddsMatch?.quotes ?? [],
    totals: oddsMatch?.totals ?? { OVER: null, UNDER: null, point: null },
    totalsDetail: bestTotalsDetail(oddsMatch),
    totalsOrigins: oddsMatch?.totalsOrigins ?? { OVER: null, UNDER: null },
    playerBookedOptions: oddsMatch?.playerBookedOptions ?? [],
    playerPropsDetail: oddsMatch?.playerPropsDetail ?? null,
    redCards: oddsMatch?.redCards ?? { NO: null, YES: null },
    redCardsDetail: oddsMatch?.redCardsDetail ?? null,
    redCardsOrigins: oddsMatch?.redCardsOrigins ?? { NO: null, YES: null },
    weekId,
    weekLabel,
    yellowCards: oddsMatch?.yellowCards ?? { OVER: null, UNDER: null, point: null },
    yellowCardsDetail: oddsMatch?.yellowCardsDetail ?? null,
    yellowCardsOrigins: oddsMatch?.yellowCardsOrigins ?? { OVER: null, UNDER: null },
  };
}

function mergeFixturesWithOdds(fixtures, oddsMatches) {
  const unmatchedOdds = new Set(oddsMatches.map((_, index) => index));

  const mergedFixtures = fixtures.map((fixture) => {
    const bestIndex = oddsMatches
      .map((oddsMatch, index) => ({
        distance: kickoffDistanceMs(fixture.kickoff, oddsMatch.kickoff),
        homeMatch: canonicalTeamName(fixture.home) === canonicalTeamName(oddsMatch.home),
        awayMatch: canonicalTeamName(fixture.away) === canonicalTeamName(oddsMatch.away),
        index,
      }))
      .filter((candidate) => candidate.homeMatch && candidate.awayMatch && candidate.distance <= 36 * 60 * 60 * 1000)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!bestIndex) {
      return makeMatchRecord(fixture, null);
    }

    unmatchedOdds.delete(bestIndex.index);
    return makeMatchRecord(fixture, oddsMatches[bestIndex.index]);
  });

  const oddsOnlyMatches = Array.from(unmatchedOdds)
    .map((index) => oddsMatches[index])
    .map((oddsMatch) =>
      makeMatchRecord(
        {
          id: `odds-${oddsMatch.providerEventId}`,
          fixtureSource: oddsMatch.oddsSource,
          group: oddsMatch.sportTitle || "Odds feed",
          home: oddsMatch.home,
          away: oddsMatch.away,
          kickoff: oddsMatch.kickoff,
        },
        oddsMatch,
      ),
    );

  return [...mergedFixtures, ...oddsOnlyMatches].sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff));
}

function demoMatchPayload(notes) {
  const matches = demoMatches.map((match) => {
    const { weekId, weekLabel } = weekInfo(match.kickoff);
    return {
      ...match,
      bookmaker: "No bookmaker yet",
      bookmakerCount: 0,
      odds: { HOME: null, DRAW: null, AWAY: null },
      oddsDetail: "No coefficients available for this match right now.",
      oddsOrigins: { HOME: null, DRAW: null, AWAY: null },
      quotes: [],
      totals: { OVER: null, UNDER: null, point: null },
      totalsDetail: "No coefficients available for goals over/under on this match yet.",
      totalsOrigins: { OVER: null, UNDER: null },
      score: {
        home: null,
        away: null,
      },
      status: "SCHEDULED",
      weekId,
      weekLabel,
    };
  });

  return {
    matches,
    meta: {
      fixtureProvider: simpleConfig.fallbackFixtureSourceLabel,
      lastUpdated: new Date().toISOString(),
      notes,
      oddsProvider: simpleConfig.fallbackOddsSourceLabel,
      usingDemoFallback: true,
    },
  };
}

function demoFuturePayload(notes) {
  return {
    markets: demoFutures.map((market) => ({
      ...market,
      bookmaker: "No bookmaker yet",
      bookmakerCount: 0,
      oddsDetail: "No coefficients available for this long-term market right now.",
      options: [],
    })),
    meta: {
      lastUpdated: new Date().toISOString(),
      notes,
      oddsProvider: simpleConfig.fallbackOddsSourceLabel,
      usingDemoFallback: true,
    },
  };
}

async function buildMatchPayload() {
  const fixtureFeed = await loadFixtureFeed();
  const oddsFeed = await loadOddsFeed();
  const notes = [...fixtureFeed.notes, ...oddsFeed.notes];

  if (!fixtureFeed.matches.length && !oddsFeed.matches.length) {
    notes.push("Using demo fallback because no live fixture or odds feed returned data.");
    return demoMatchPayload(notes);
  }

  const fixtureMatches = fixtureFeed.matches.map((match) => ({
    fixtureSource: fixtureFeed.provider,
    group: match.group || match.stage || match.competition || "Upcoming",
    home: match.homeTeam,
    homeScore: match.homeScore,
    away: match.awayTeam,
    awayScore: match.awayScore,
    id: `${match.provider}-${match.providerMatchId}`,
    kickoff: match.kickoff,
    stage: match.stage,
    status: match.status,
  }));

  const mergedMatches = mergeFixturesWithOdds(fixtureMatches, oddsFeed.matches);

  const fallbackUsed = mergedMatches.some((match) => match.oddsSource === simpleConfig.fallbackOddsSourceLabel);

  return {
    matches: mergedMatches,
    meta: {
      fixtureProvider: fixtureFeed.provider,
      lastUpdated: new Date().toISOString(),
      notes,
      oddsProvider: oddsFeed.provider,
      usingDemoFallback: fallbackUsed || (!fixtureFeed.matches.length && !oddsFeed.matches.length),
    },
  };
}

async function buildFuturePayload() {
  if (!futuresEnabled) {
    return {
      markets: [],
      meta: {
        lastUpdated: new Date().toISOString(),
        notes: ["Tournament specials are turned off in this low-request setup."],
        oddsProvider: simpleConfig.fallbackOddsSourceLabel,
        usingDemoFallback: false,
      },
    };
  }

  const futureFeed = await loadFutureFeed();
  const notes = [...futureFeed.notes];

  if (!futureFeed.markets.length) {
    notes.push("Using demo fallback because no live outright market returned data.");
    return demoFuturePayload(notes);
  }

  return {
    markets: futureFeed.markets,
    meta: {
      lastUpdated: new Date().toISOString(),
      notes,
      oddsProvider: futureFeed.provider,
      usingDemoFallback: false,
    },
  };
}

async function getCachedMatchPayload(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && matchCache.value && matchCache.expiresAt > now) {
    return matchCache.value;
  }

  if (matchCache.pending) {
    return matchCache.pending;
  }

  matchCache.pending = buildMatchPayload()
    .then((payload) => {
      matchCache.value = payload;
      matchCache.expiresAt = Date.now() + matchCacheTtlMs;
      matchCache.pending = null;
      return payload;
    })
    .catch((error) => {
      matchCache.pending = null;
      throw error;
    });

  return matchCache.pending;
}

async function getCachedFuturePayload(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && futureCache.value && futureCache.expiresAt > now) {
    return futureCache.value;
  }

  if (futureCache.pending) {
    return futureCache.pending;
  }

  futureCache.pending = buildFuturePayload()
    .then((payload) => {
      futureCache.value = payload;
      futureCache.expiresAt = Date.now() + futureCacheTtlMs;
      futureCache.pending = null;
      return payload;
    })
    .catch((error) => {
      futureCache.pending = null;
      throw error;
    });

  return futureCache.pending;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/matches") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getCachedMatchPayload(refresh);
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/futures") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getCachedFuturePayload(refresh);
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/app-config.js") {
      sendScript(response, 200, `window.GOONBET_CONFIG = ${JSON.stringify(publicAppConfig, null, 2)};\n`);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, requestUrl);
      if (!handled) {
        sendJson(response, 404, { error: "API route not found." });
      }
      return;
    }

    const filePath = resolveRequestPath(requestUrl.pathname);
    if (!filePath.startsWith(rootDir)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      sendText(response, 403, "Directory listing is disabled");
      return;
    }

    const body = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
    });
    response.end(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid JSON body." });
      return;
    }

    response.writeHead(error?.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error?.code === "ENOENT" ? "Not found" : `Server error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`GoonBet is ready at http://${host}:${port}`);
});
