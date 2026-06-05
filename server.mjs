import http from "node:http";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFootballDataCompetitionFeed, fetchFootballDataJson, normalizeFootballDataMatch } from "./integrations/providers/football-data.mjs";
import { buildTheOddsApiRequest, fetchTheOddsApiJson, normalizeTheOddsApiMatch } from "./integrations/providers/the-odds-api.mjs";
import { demoMatches, simpleConfig } from "./data/simple-app-data.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeEnv = loadRuntimeEnv();
const port = Number(runtimeEnv.PORT || 4173);
const host = runtimeEnv.HOST || "0.0.0.0";
const cacheTtlMs = Number(runtimeEnv.CACHE_TTL_SECONDS || simpleConfig.cacheTtlSeconds) * 1000;
const matchLookaheadDays = Number(runtimeEnv.MATCH_LOOKAHEAD_DAYS || simpleConfig.matchLookaheadDays);

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

const publicAppConfig = {
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

function canonicalTeamName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|ac|sc|club|football)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const future = new Date();
  future.setUTCDate(today.getUTCDate() + matchLookaheadDays);
  return {
    dateFrom: toIsoDate(today),
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

async function loadOddsFeed() {
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
    return {
      provider: "The Odds API",
      matches: (data ?? []).map(normalizeTheOddsApiMatch),
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
    weekId,
    weekLabel,
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
    away: match.awayTeam,
    id: `${match.provider}-${match.providerMatchId}`,
    kickoff: match.kickoff,
    stage: match.stage,
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
      matchCache.expiresAt = Date.now() + cacheTtlMs;
      matchCache.pending = null;
      return payload;
    })
    .catch((error) => {
      matchCache.pending = null;
      throw error;
    });

  return matchCache.pending;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/matches") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getCachedMatchPayload(refresh);
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
