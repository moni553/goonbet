import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { demoFutures, demoMatches, simpleConfig } from "./data/simple-app-data.js";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const USERNAME_EMAIL_DOMAIN = "players.goonbet.app";
const FINAL_MATCH_STATUSES = new Set(["AWARDED", "FINISHED", "FINAL", "FT"]);
const LIVE_MATCH_STATUSES = new Set([
  "EXTRA_TIME",
  "HALF_TIME",
  "IN_PLAY",
  "LIVE",
  "PAUSED",
  "PENALTY_SHOOTOUT",
  "SUSPENDED",
]);

const state = {
  account: null,
  authBusy: false,
  authMessage: "",
  bets: [],
  betDrafts: {},
  futures: [],
  matches: [],
  meta: defaultMeta(),
  publicBets: [],
  publicBoard: {
    activity: [],
    leaderboard: [],
  },
  publicPlayers: [],
  publicPoolMessage: "",
  search: "",
  selectedBoardTab: "matches",
  selectedWeek: "all",
  supabase: null,
  supabaseConfigured: false,
};

const currency = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function defaultMeta() {
  return {
    fixtureProvider: simpleConfig.fallbackFixtureSourceLabel,
    lastUpdated: null,
    notes: [],
    oddsProvider: simpleConfig.fallbackOddsSourceLabel,
    usingDemoFallback: true,
  };
}

function defaultMatchPayload(note) {
  return {
    matches: demoMatches.map(normalizeMatch),
    meta: {
      ...defaultMeta(),
      lastUpdated: new Date().toISOString(),
      notes: note ? [note] : [],
    },
  };
}

function normalizeMatch(match) {
  return {
    bookmaker: match.bookmaker ?? "No bookmaker yet",
    bookmakerCount: match.bookmakerCount ?? 0,
    fixtureSource: match.fixtureSource ?? simpleConfig.fallbackFixtureSourceLabel,
    group: match.group ?? "Upcoming",
    home: match.home ?? "Home team",
    away: match.away ?? "Away team",
    id: match.id,
    kickoff: match.kickoff,
    odds: match.odds ?? { HOME: null, DRAW: null, AWAY: null },
    oddsDetail: match.oddsDetail ?? "No live bookmaker prices matched this fixture yet.",
    oddsOrigins: match.oddsOrigins ?? { HOME: null, DRAW: null, AWAY: null },
    oddsSource: match.oddsSource ?? simpleConfig.fallbackOddsSourceLabel,
    quotes: match.quotes ?? [],
    score: {
      home: Number.isFinite(match.score?.home) ? Number(match.score.home) : null,
      away: Number.isFinite(match.score?.away) ? Number(match.score.away) : null,
    },
    status: match.status ?? "SCHEDULED",
    totals: match.totals ?? { OVER: null, UNDER: null, point: null },
    totalsDetail: match.totalsDetail ?? "No live over/under total returned for this fixture yet.",
    totalsOrigins: match.totalsOrigins ?? { OVER: null, UNDER: null },
    weekId: match.weekId ?? "all",
    weekLabel: match.weekLabel ?? "Current week",
  };
}

function normalizeBet(bet) {
  return {
    away: bet.away,
    bookmaker: bet.bookmaker,
    displayName: bet.display_name ?? bet.displayName ?? null,
    home: bet.home,
    id: bet.id,
    kickoff: bet.kickoff,
    marketLine: bet.market_line == null ? null : Number(bet.market_line),
    marketType: bet.market_type ?? "match_result",
    matchId: bet.match_id,
    odds: Number(bet.odds),
    oddsSource: bet.odds_source,
    placedAt: bet.placed_at,
    selection: bet.selection,
    selectionLabel: bet.selection_label,
    stake: Number(bet.stake),
    userId: bet.user_id ?? null,
  };
}

function normalizePublicPlayer(player) {
  return {
    createdAt: player.created_at ?? null,
    displayName: player.display_name ?? "Player",
    id: player.id,
  };
}

function normalizeFutureMarket(market) {
  return {
    away: market.subtitle ?? "Tournament special",
    bookmaker: market.bookmaker ?? "No bookmaker yet",
    bookmakerCount: market.options?.length ?? 0,
    fixtureSource: market.fixtureSource ?? "Tournament specials board",
    group: "Tournament specials",
    home: market.title ?? "Tournament special",
    id: market.id,
    kickoff: market.kickoff,
    marketType: market.marketType,
    oddsDetail: market.oddsDetail ?? "No future prices loaded yet.",
    oddsSource: market.oddsSource ?? simpleConfig.fallbackOddsSourceLabel,
    options: (market.options ?? []).map((option) => ({
      label: option.label,
      odds: Number(option.odds),
      origin: option.origin ?? market.bookmaker ?? "No bookmaker yet",
      selection: option.selection,
    })),
    resultSelection: market.resultSelection ?? null,
    status: market.status ?? "SCHEDULED",
    subtitle: market.subtitle ?? "Tournament special",
    title: market.title ?? "Tournament special",
  };
}

function readPublicConfig() {
  return window.GOONBET_CONFIG ?? {};
}

function hasSupabaseConfig() {
  const config = readPublicConfig();
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  return `${currency.format(Math.round(Number(value) || 0))} GOON`;
}

function formatSignedMoney(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(amount))}`;
}

function formatKickoff(value) {
  return new Intl.DateTimeFormat("en-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function normalizeUsername(rawValue) {
  return String(rawValue || "")
    .trim()
    .toLowerCase();
}

function usernameToEmail(username) {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

function emailToUsername(emailValue) {
  return String(emailValue || "").split("@")[0] || "player";
}

function readCredentialsFromForm() {
  const username = normalizeUsername(document.getElementById("username-input").value);
  const password = document.getElementById("password-input").value.trim();

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username must be 3-24 characters using letters, numbers, _ or -.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  return {
    email: usernameToEmail(username),
    password,
    username,
  };
}

function roundPayout(value) {
  return Math.round(Number(value) || 0);
}

function isFutureMarketType(marketType) {
  return marketType === "future_winner" || marketType === "future_top_scorer";
}

function matchById(matchId) {
  return state.matches.find((match) => match.id === matchId) ?? null;
}

function futureById(matchId) {
  return state.futures.find((future) => future.id === matchId) ?? null;
}

function futureOptionBySelection(future, selection) {
  return future?.options?.find((option) => option.selection === selection) ?? null;
}

function betDisplayTitle(bet) {
  return isFutureMarketType(bet.marketType) ? bet.home : `${bet.home} vs ${bet.away}`;
}

function betContextLabel(bet) {
  return isFutureMarketType(bet.marketType) ? bet.home : `${bet.home} vs ${bet.away}`;
}

function betMarketLabel(bet) {
  if (bet.marketType === "totals") {
    return `Over / Under ${bet.marketLine?.toFixed(1) ?? ""}`.trim();
  }

  if (bet.marketType === "future_winner") {
    return "World Cup winner";
  }

  if (bet.marketType === "future_top_scorer") {
    return "Top scorer";
  }

  return "Match result";
}

function futureResultLabel(future) {
  return futureOptionBySelection(future, future?.resultSelection)?.label ?? future?.resultSelection ?? "No result yet";
}

function marketLocked(item) {
  return new Date(item.kickoff).getTime() <= Date.now();
}

function matchPhase(match) {
  const status = String(match?.status || "").toUpperCase();

  if (FINAL_MATCH_STATUSES.has(status)) {
    return "FINAL";
  }

  if (LIVE_MATCH_STATUSES.has(status)) {
    return "LIVE";
  }

  if (match?.kickoff && marketLocked(match)) {
    return "LOCKED";
  }

  return "SCHEDULED";
}

function matchHasFinalScore(match) {
  return (
    Boolean(match) &&
    matchPhase(match) === "FINAL" &&
    Number.isFinite(match.score?.home) &&
    Number.isFinite(match.score?.away)
  );
}

function scorelineLabel(match) {
  if (!match || !Number.isFinite(match.score?.home) || !Number.isFinite(match.score?.away)) {
    return "No score yet";
  }

  return `${match.score.home} - ${match.score.away}`;
}

function matchOutcome(match) {
  if (!matchHasFinalScore(match)) {
    return null;
  }

  if (match.score.home > match.score.away) {
    return "HOME";
  }

  if (match.score.home < match.score.away) {
    return "AWAY";
  }

  return "DRAW";
}

function evaluateBet(bet) {
  if (isFutureMarketType(bet.marketType)) {
    const future = futureById(bet.matchId);
    const phase = future ? matchPhase(future) : new Date(bet.kickoff).getTime() <= Date.now() ? "LOCKED" : "SCHEDULED";

    if (!future?.resultSelection) {
      return {
        future,
        isSettled: false,
        match: null,
        net: 0,
        payout: 0,
        phase,
        result: "OPEN",
      };
    }

    const won = future.resultSelection === bet.selection;
    const payout = won ? roundPayout(bet.stake * bet.odds) : 0;

    return {
      future,
      isSettled: true,
      match: null,
      net: won ? payout - bet.stake : -bet.stake,
      payout,
      phase,
      result: won ? "WON" : "LOST",
    };
  }

  const match = matchById(bet.matchId);
  const phase = match ? matchPhase(match) : new Date(bet.kickoff).getTime() <= Date.now() ? "LOCKED" : "SCHEDULED";

  if (!match || !matchHasFinalScore(match)) {
    return {
      isSettled: false,
      match,
      net: 0,
      payout: 0,
      phase,
      result: "OPEN",
    };
  }

  if (bet.marketType === "totals") {
    const totalGoals = match.score.home + match.score.away;
    const line = Number(bet.marketLine);

    if (!Number.isFinite(line)) {
      return {
        isSettled: false,
        match,
        net: 0,
        payout: 0,
        phase,
        result: "OPEN",
      };
    }

    if (totalGoals === line) {
      return {
        isSettled: true,
        match,
        net: 0,
        payout: bet.stake,
        phase,
        result: "PUSH",
      };
    }

    const won = bet.selection === "OVER" ? totalGoals > line : totalGoals < line;
    const payout = won ? roundPayout(bet.stake * bet.odds) : 0;

    return {
      isSettled: true,
      match,
      net: won ? payout - bet.stake : -bet.stake,
      payout,
      phase,
      result: won ? "WON" : "LOST",
    };
  }

  const outcome = matchOutcome(match);
  const won = outcome === bet.selection;
  const payout = won ? roundPayout(bet.stake * bet.odds) : 0;

  return {
    isSettled: true,
    match,
    net: won ? payout - bet.stake : -bet.stake,
    payout,
    phase,
    result: won ? "WON" : "LOST",
  };
}

function ownBetEvaluations() {
  return state.bets.map((bet) => ({
    bet,
    settlement: evaluateBet(bet),
  }));
}

function totalStakeForAccount() {
  return ownBetEvaluations()
    .filter((item) => !item.settlement.isSettled)
    .reduce((sum, item) => sum + item.bet.stake, 0);
}

function settledProfitForAccount() {
  return ownBetEvaluations()
    .filter((item) => item.settlement.isSettled)
    .reduce((sum, item) => sum + item.settlement.net, 0);
}

function contestValueForAccount() {
  return simpleConfig.startingBankroll + settledProfitForAccount();
}

function bankrollLeft() {
  return contestValueForAccount() - totalStakeForAccount();
}

function availableWeeks() {
  const unique = new Map();
  state.matches.forEach((match) => {
    unique.set(match.weekId, {
      id: match.weekId,
      label: match.weekLabel,
    });
  });

  return [
    { id: "all", label: "All weeks" },
    ...Array.from(unique.values()).sort((left, right) => left.id.localeCompare(right.id)),
  ];
}

function filteredMatches() {
  const query = state.search.trim().toLowerCase();
  return state.matches.filter((match) => {
    const weekMatch = state.selectedWeek === "all" || match.weekId === state.selectedWeek;
    if (!weekMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      match.home,
      match.away,
      match.group,
      match.weekLabel,
      match.bookmaker,
      match.fixtureSource,
      match.oddsSource,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function findExistingBet(matchId, marketType = "match_result") {
  return state.bets.find((bet) => bet.matchId === matchId && bet.marketType === marketType);
}

function draftKey(matchId, marketType) {
  return `${matchId}:${marketType}`;
}

function getBetDraft(matchId, marketType) {
  return (
    state.betDrafts[draftKey(matchId, marketType)] ?? {
      selection: "",
      stake: String(simpleConfig.defaultStake),
    }
  );
}

function updateBetDraft(matchId, marketType, patch) {
  const key = draftKey(matchId, marketType);
  state.betDrafts[key] = {
    ...getBetDraft(matchId, marketType),
    ...patch,
  };
}

function clearBetDraft(matchId, marketType) {
  delete state.betDrafts[draftKey(matchId, marketType)];
}

function setAuthMessage(message) {
  state.authMessage = message;
  renderAuthStatus();
}

function renderAuthStatus() {
  document.getElementById("auth-status").textContent = state.authMessage;
}

function setAuthBusy(isBusy) {
  state.authBusy = isBusy;
  const form = document.getElementById("login-form");
  const inputs = form.querySelectorAll("input, button");
  inputs.forEach((input) => {
    input.disabled = isBusy || !state.supabaseConfigured;
  });
}

function buildPublicBoard() {
  const playerMap = new Map();

  state.publicPlayers.forEach((player) => {
    playerMap.set(player.id, player);
  });

  state.publicBets.forEach((bet) => {
    if (!playerMap.has(bet.userId)) {
      playerMap.set(bet.userId, {
        createdAt: null,
        displayName: bet.displayName ?? "Player",
        id: bet.userId,
      });
    }
  });

  const evaluatedBets = state.publicBets.map((bet) => ({
    ...bet,
    settlement: evaluateBet(bet),
  }));

  const leaderboard = Array.from(playerMap.values())
    .map((player) => {
      const playerBets = evaluatedBets.filter((bet) => bet.userId === player.id);
      const activeStake = playerBets
        .filter((bet) => !bet.settlement.isSettled)
        .reduce((sum, bet) => sum + bet.stake, 0);
      const settledProfit = playerBets
        .filter((bet) => bet.settlement.isSettled)
        .reduce((sum, bet) => sum + bet.settlement.net, 0);
      const contestValue = simpleConfig.startingBankroll + settledProfit;
      const availableCash = contestValue - activeStake;

      return {
        activeBetCount: playerBets.filter((bet) => !bet.settlement.isSettled).length,
        activeStake,
        availableCash,
        contestValue,
        displayName: player.displayName,
        id: player.id,
        settledProfit,
        totalBets: playerBets.length,
        wonCount: playerBets.filter((bet) => bet.settlement.result === "WON").length,
      };
    })
    .sort((left, right) => {
      if (right.contestValue !== left.contestValue) {
        return right.contestValue - left.contestValue;
      }

      if (right.availableCash !== left.availableCash) {
        return right.availableCash - left.availableCash;
      }

      if (right.wonCount !== left.wonCount) {
        return right.wonCount - left.wonCount;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  const activity = evaluatedBets
    .flatMap((bet) => {
      const events = [
        {
          detail: `${betContextLabel(bet)} | ${bet.selectionLabel} @ ${bet.odds.toFixed(2)}`,
          displayName: bet.displayName ?? "Player",
          id: `placed-${bet.id}`,
          time: new Date(bet.placedAt ?? bet.kickoff).getTime(),
          title: `placed ${formatMoney(bet.stake)} on ${bet.selectionLabel}`,
          type: "placed",
        },
      ];

      if (!bet.settlement.isSettled) {
        return events;
      }

      const settledAt = new Date(bet.kickoff).getTime() + 2 * 60 * 60 * 1000;
      const settledDetail = bet.settlement.future
        ? `${betContextLabel(bet)} settled | Winner: ${futureResultLabel(bet.settlement.future)}`
        : `${betContextLabel(bet)} finished ${scorelineLabel(bet.settlement.match)}`;

      if (bet.settlement.result === "WON") {
        events.unshift({
          detail: `${settledDetail} | Net ${formatSignedMoney(bet.settlement.net)}`,
          displayName: bet.displayName ?? "Player",
          id: `won-${bet.id}`,
          time: settledAt,
          title: `won ${formatMoney(bet.settlement.payout)} on ${bet.selectionLabel}`,
          type: "won",
        });
      } else if (bet.settlement.result === "PUSH") {
        events.unshift({
          detail: `${settledDetail} | Stake returned`,
          displayName: bet.displayName ?? "Player",
          id: `push-${bet.id}`,
          time: settledAt,
          title: `got ${formatMoney(bet.settlement.payout)} back on ${bet.selectionLabel}`,
          type: "push",
        });
      } else {
        events.unshift({
          detail: settledDetail,
          displayName: bet.displayName ?? "Player",
          id: `lost-${bet.id}`,
          time: settledAt,
          title: `lost ${formatMoney(bet.stake)} on ${bet.selectionLabel}`,
          type: "lost",
        });
      }

      return events;
    })
    .sort((left, right) => right.time - left.time)
    .slice(0, 48);

  return {
    activity,
    leaderboard,
  };
}

function recalculatePublicBoard() {
  state.publicBoard = buildPublicBoard();
}

function syncHero() {
  const leader = state.publicBoard.leaderboard[0] ?? null;
  const liveCopy = state.meta.usingDemoFallback
    ? "Demo fallback is active right now. Add live provider keys to switch the public board onto real fixtures and coefficients."
    : `Live board is on. Fixtures: ${state.meta.fixtureProvider}. Coefficients: ${state.meta.oddsProvider}.`;

  const betCopy = !state.supabaseConfigured
    ? "Betting is offline until Supabase public keys are configured."
    : state.account
      ? `${state.account.username} is signed in and ready to bet.`
      : "Public viewing is open; betting unlocks after username and password login.";

  const leaderCopy = leader
    ? `${leader.displayName} leads on ${formatMoney(leader.contestValue)} with ${formatMoney(leader.activeStake)} in active bets.`
    : state.publicPoolMessage
      ? state.publicPoolMessage
      : "No players are on the leaderboard yet.";

  document.getElementById("hero-text").textContent = simpleConfig.tagline;
  document.getElementById("hero-stats").innerHTML = [
    {
      title: "Weeks",
      copy: `${Math.max(availableWeeks().length - 1, 0)} weekly buckets loaded.`,
    },
    {
      title: "Matches",
      copy: `${state.matches.length} matches and ${state.futures.length} long-term specials currently on the board.`,
    },
    {
      title: "Leader",
      copy: leaderCopy,
    },
    {
      title: "Betting",
      copy: betCopy,
    },
    {
      title: "Board status",
      copy: liveCopy,
    },
  ]
    .map(
      (item) => `
        <article class="stat-card">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.copy)}</span>
        </article>
      `,
    )
    .join("");
}

function renderAuthControls() {
  const form = document.getElementById("login-form");
  const isLoggedIn = Boolean(state.account);

  form.classList.toggle("hidden", isLoggedIn);
  setAuthBusy(state.authBusy);

  if (!state.supabaseConfigured) {
    setAuthMessage("Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to enable real accounts.");
    return;
  }

  if (isLoggedIn) {
    setAuthMessage("");
  } else if (!state.authMessage) {
    setAuthMessage("Create a username and password, or log in with the one you already made.");
  }
}

function renderAccount() {
  const card = document.getElementById("account-card");

  if (!state.supabaseConfigured) {
    card.innerHTML = `
      <div class="small-note">
        Browsing works already. Betting accounts come online as soon as Supabase public keys are added.
      </div>
    `;
    return;
  }

  if (!state.account) {
    card.innerHTML = `
      <div class="small-note">
        Guests can browse every weekly match. Bettors create a username and password, then place one fake-money bet per market.
      </div>
    `;
    return;
  }

  const settledProfit = settledProfitForAccount();

  card.innerHTML = `
    <div class="bet-row">
      <span>Signed in as</span>
      <strong>${escapeHtml(state.account.username)}</strong>
    </div>
    <div class="bet-row">
      <span>Starting bankroll</span>
      <strong>${escapeHtml(formatMoney(simpleConfig.startingBankroll))}</strong>
    </div>
    <div class="bet-row">
      <span>Settled swing</span>
      <strong class="${settledProfit >= 0 ? "amount-good" : "amount-bad"}">${escapeHtml(formatSignedMoney(settledProfit))}</strong>
    </div>
    <div class="bet-row">
      <span>Total GOON</span>
      <strong>${escapeHtml(formatMoney(contestValueForAccount()))}</strong>
    </div>
    <div class="bet-row">
      <span>In active bets</span>
      <strong class="amount-bad">${escapeHtml(formatMoney(totalStakeForAccount()))}</strong>
    </div>
    <div class="bet-row">
      <span>Available now</span>
      <strong class="amount-good">${escapeHtml(formatMoney(bankrollLeft()))}</strong>
    </div>
    <button id="logout-button" class="button ghost" type="button">Sign out</button>
  `;

  document.getElementById("logout-button").addEventListener("click", async () => {
    if (!state.supabase) {
      return;
    }

    const { error } = await state.supabase.auth.signOut();
    if (error) {
      setAuthMessage(error.message);
      return;
    }

    state.account = null;
    state.bets = [];
    state.betDrafts = {};
    await loadPublicPool();
    renderApp();
    setAuthMessage("Signed out. You can log back in with your username and password any time.");
  });
}

function renderWeeks() {
  const counts = new Map();
  state.matches.forEach((match) => {
    counts.set(match.weekId, (counts.get(match.weekId) ?? 0) + 1);
  });

  document.getElementById("week-tabs").innerHTML = availableWeeks()
    .map(
      (week) => `
        <button class="week-chip ${state.selectedWeek === week.id ? "active" : ""}" data-week="${escapeHtml(week.id)}" type="button">
          <strong>${escapeHtml(week.label)}</strong>
          <span>${week.id === "all" ? state.matches.length : counts.get(week.id) ?? 0} matches</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-week]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedWeek = button.dataset.week;
      renderWeeks();
      renderMatches();
    });
  });
}

function renderBoardTabs() {
  const container = document.getElementById("board-tabs");
  const tabs = [
    {
      id: "matches",
      title: "Weekly matches",
      copy: `${state.matches.length} match bets`,
    },
    {
      id: "futures",
      title: "Tournament specials",
      copy: `${state.futures.length} long-term bets`,
    },
  ];

  container.innerHTML = tabs
    .map(
      (tab) => `
        <button class="board-tab ${state.selectedBoardTab === tab.id ? "active" : ""}" data-board-tab="${escapeHtml(tab.id)}" type="button">
          <strong>${escapeHtml(tab.title)}</strong>
          <span>${escapeHtml(tab.copy)}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-board-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedBoardTab = button.dataset.boardTab;
      renderBoardTabs();
      renderBoardPanels();
    });
  });
}

function renderBoardPanels() {
  document.getElementById("matches-panel").classList.toggle("hidden", state.selectedBoardTab !== "matches");
  document.getElementById("future-panel").classList.toggle("hidden", state.selectedBoardTab !== "futures");
}

function selectionPrice(match, marketType, selection) {
  if (isFutureMarketType(marketType)) {
    return futureOptionBySelection(match, selection)?.odds ?? null;
  }

  if (marketType === "totals") {
    return match.totals?.[selection] ?? null;
  }

  return match.odds?.[selection] ?? null;
}

function selectionOrigin(match, marketType, selection) {
  if (isFutureMarketType(marketType)) {
    return futureOptionBySelection(match, selection)?.origin ?? match.bookmaker;
  }

  if (marketType === "totals") {
    return match.totalsOrigins?.[selection] ?? match.bookmaker;
  }

  return match.oddsOrigins?.[selection] ?? match.bookmaker;
}

function selectionDisabled(match, marketType, selection, existing) {
  return !state.account || marketLocked(match) || Boolean(existing) || !selectionPrice(match, marketType, selection);
}

function draftStakeNumber(matchId, marketType) {
  return Number(getBetDraft(matchId, marketType).stake || 0);
}

function canPlaceDraft(match, marketType, existing) {
  const draft = getBetDraft(match.id, marketType);
  return Boolean(
    state.account &&
      !marketLocked(match) &&
      !existing &&
      draft.selection &&
      selectionPrice(match, marketType, draft.selection),
  );
}

function quoteMarkup(match) {
  if (!match.quotes?.length) {
    return `<div class="small-note">${escapeHtml(match.oddsDetail || "No live bookmaker quotes returned for this match yet.")}</div>`;
  }

  return `
    <div class="quotes-list">
      ${match.quotes
        .slice(0, 3)
        .map(
          (quote) => `
            <div class="quote-row">
              <span>${escapeHtml(quote.bookmaker)}</span>
              <strong>
                H ${quote.odds.HOME?.toFixed(2) ?? "-"} |
                D ${quote.odds.DRAW?.toFixed(2) ?? "-"} |
                A ${quote.odds.AWAY?.toFixed(2) ?? "-"} |
                O${quote.totals?.point?.toFixed(1) ?? "-"} ${quote.totals?.OVER?.toFixed(2) ?? "-"} |
                U${quote.totals?.point?.toFixed(1) ?? "-"} ${quote.totals?.UNDER?.toFixed(2) ?? "-"}
              </strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function marketBadge(match, marketType) {
  if (marketType === "future_winner") {
    return "World Cup winner";
  }

  if (marketType === "future_top_scorer") {
    return "Top scorer";
  }

  if (marketType === "totals") {
    return match.totals?.point ? `Over / Under ${match.totals.point.toFixed(1)}` : "Over / Under";
  }

  return "Match result";
}

function selectionLabel(match, selection, marketType) {
  if (isFutureMarketType(marketType)) {
    return futureOptionBySelection(match, selection)?.label ?? selection;
  }

  if (marketType === "totals") {
    const point = match.totals?.point?.toFixed(1) ?? "2.5";
    return selection === "OVER" ? `Over ${point} goals` : `Under ${point} goals`;
  }

  if (selection === "HOME") {
    return `${match.home} win`;
  }
  if (selection === "AWAY") {
    return `${match.away} win`;
  }
  return "Draw";
}

function renderFutureMarkets() {
  const container = document.getElementById("future-market-list");

  if (!state.futures.length) {
    container.innerHTML = `<div class="empty-state">No long-term specials are loaded right now.</div>`;
    return;
  }

  container.innerHTML = state.futures
    .map((future) => {
      const existingBet = findExistingBet(future.id, future.marketType);
      const draft = getBetDraft(future.id, future.marketType);

      return `
        <article class="future-card">
          <div class="future-top">
            <div>
              <div class="small-note">${escapeHtml(formatKickoff(future.kickoff))} lock time</div>
              <h3>${escapeHtml(future.title)}</h3>
              <div class="future-subline">${escapeHtml(future.subtitle)}</div>
            </div>
            <span class="tag">${escapeHtml(future.oddsSource)}</span>
          </div>
          <div class="market-section">
            <div class="market-head">
              <strong>${escapeHtml(marketBadge(future, future.marketType))}</strong>
              <span>${escapeHtml(future.oddsDetail)}</span>
            </div>
            <div class="future-options">
              ${future.options
                .map(
                  (option) => `
                    <button
                      class="odd-button ${draft.selection === option.selection ? "selected" : ""}"
                      type="button"
                      data-future-selection="true"
                      data-match-id="${escapeHtml(future.id)}"
                      data-market-type="${escapeHtml(future.marketType)}"
                      data-selection="${escapeHtml(option.selection)}"
                      ${selectionDisabled(future, future.marketType, option.selection, existingBet) ? "disabled" : ""}
                    >
                      <strong>${escapeHtml(option.label)}</strong>
                      <span>${option.odds.toFixed(2)}</span>
                      <span>Best from ${escapeHtml(option.origin)}</span>
                    </button>
                  `,
                )
                .join("")}
            </div>
            <div class="bet-action-bar">
              <label class="field" for="stake-${escapeHtml(future.id)}-${escapeHtml(future.marketType)}">
                <span>Stake</span>
                <input
                  id="stake-${escapeHtml(future.id)}-${escapeHtml(future.marketType)}"
                  type="number"
                  min="10"
                  max="${simpleConfig.maxStake}"
                  value="${escapeHtml(draft.stake)}"
                  data-future-stake="true"
                  data-match-id="${escapeHtml(future.id)}"
                  data-market-type="${escapeHtml(future.marketType)}"
                />
              </label>
              <button
                class="button primary"
                type="button"
                data-future-place="true"
                data-match-id="${escapeHtml(future.id)}"
                data-market-type="${escapeHtml(future.marketType)}"
                ${canPlaceDraft(future, future.marketType, existingBet) ? "" : "disabled"}
              >
                Place bet
              </button>
            </div>
            <div class="small-note">
              ${
                existingBet
                  ? `Already bet: ${escapeHtml(existingBet.selectionLabel)} at ${existingBet.odds.toFixed(2)}`
                  : !state.account
                    ? "Log in first to place a long-term bet."
                    : marketLocked(future)
                      ? "This long-term market is locked now."
                    : !draft.selection
                      ? "1. Choose your long-term pick. 2. Enter a stake. 3. Press Place bet."
                      : `Selected: ${escapeHtml(selectionLabel(future, draft.selection, future.marketType))}. Press Place bet to confirm.`
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-future-selection='true']").forEach((button) => {
    button.addEventListener("click", () => {
      updateBetDraft(button.dataset.matchId, button.dataset.marketType, {
        selection: button.dataset.selection,
      });
      renderFutureMarkets();
    });
  });

  document.querySelectorAll("[data-future-stake='true']").forEach((input) => {
    input.addEventListener("input", () => {
      updateBetDraft(input.dataset.matchId, input.dataset.marketType, {
        stake: input.value,
      });
    });
  });

  document.querySelectorAll("[data-future-place='true']").forEach((button) => {
    button.addEventListener("click", async () => {
      const future = futureById(button.dataset.matchId);
      const marketType = button.dataset.marketType;
      const draft = getBetDraft(button.dataset.matchId, marketType);

      if (!future) {
        return;
      }

      await placeBet(future, draft.selection, draftStakeNumber(future.id, marketType), marketType);
    });
  });
}

function renderMatches() {
  const matchList = document.getElementById("match-list");
  const matches = filteredMatches();

  if (!matches.length) {
    matchList.innerHTML = `<div class="empty-state">No matches found for that search and week filter.</div>`;
    return;
  }

  matchList.innerHTML = matches
    .map((match) => {
      const existingResult = findExistingBet(match.id, "match_result");
      const existingTotals = findExistingBet(match.id, "totals");
      const resultDraft = getBetDraft(match.id, "match_result");
      const totalsDraft = getBetDraft(match.id, "totals");
      return `
        <article class="match-card">
          <div class="match-top">
            <div>
              <div class="small-note">${escapeHtml(match.weekLabel)} | ${escapeHtml(match.group)}</div>
              <h3>${escapeHtml(match.home)} vs ${escapeHtml(match.away)}</h3>
              <div class="match-meta">${escapeHtml(formatKickoff(match.kickoff))} | ${escapeHtml(match.fixtureSource)}</div>
            </div>
            <span class="tag">${escapeHtml(match.oddsSource)}</span>
          </div>
          <div class="market-section">
            <div class="market-head">
              <strong>${escapeHtml(marketBadge(match, "match_result"))}</strong>
              <span>${escapeHtml(match.oddsDetail)}</span>
            </div>
            <div class="odds-grid">
              ${["HOME", "DRAW", "AWAY"]
                .map((selection) => {
                  const labels = {
                    HOME: `${match.home} win`,
                    DRAW: "Draw",
                    AWAY: `${match.away} win`,
                  };
                  const origin = match.oddsOrigins?.[selection];

                  return `
                    <button
                      class="odd-button ${resultDraft.selection === selection ? "selected" : ""}"
                      type="button"
                      data-match-id="${escapeHtml(match.id)}"
                      data-market-type="match_result"
                      data-selection="${selection}"
                      ${selectionDisabled(match, "match_result", selection, existingResult) ? "disabled" : ""}
                    >
                      <strong>${escapeHtml(labels[selection])}</strong>
                      <span>${match.odds[selection] ? match.odds[selection].toFixed(2) : "No odds"}</span>
                      <span>${origin ? `Best from ${escapeHtml(origin)}` : "Unavailable"}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
            <div class="bet-action-bar">
              <label class="field" for="stake-${escapeHtml(match.id)}-match_result">
                <span>Stake</span>
                <input
                  id="stake-${escapeHtml(match.id)}-match_result"
                  type="number"
                  min="10"
                  max="${simpleConfig.maxStake}"
                  value="${escapeHtml(resultDraft.stake)}"
                  data-stake-input="true"
                  data-match-id="${escapeHtml(match.id)}"
                  data-market-type="match_result"
                />
              </label>
              <button
                class="button primary"
                type="button"
                data-place-bet="true"
                data-match-id="${escapeHtml(match.id)}"
                data-market-type="match_result"
                ${canPlaceDraft(match, "match_result", existingResult) ? "" : "disabled"}
              >
                Place bet
              </button>
            </div>
            <div class="small-note">
              ${
                existingResult
                  ? `Already bet: ${escapeHtml(existingResult.selectionLabel)} at ${existingResult.odds.toFixed(2)}`
                  : !state.account
                    ? "Log in first to place a bet."
                    : marketLocked(match)
                      ? "Betting is locked because kickoff has passed."
                    : !match.odds.HOME
                      ? "Fixture loaded, but there are no live 1X2 prices yet."
                      : !resultDraft.selection
                        ? "1. Choose a result outcome. 2. Enter a stake. 3. Press Place bet."
                        : `Selected: ${escapeHtml(selectionLabel(match, resultDraft.selection, "match_result"))}. Press Place bet to confirm.`
              }
            </div>
          </div>
          <div class="market-section">
            <div class="market-head">
              <strong>${escapeHtml(marketBadge(match, "totals"))}</strong>
              <span>${escapeHtml(match.totalsDetail)}</span>
            </div>
            <div class="odds-grid totals-grid">
              ${["OVER", "UNDER"]
                .map((selection) => {
                  const origin = match.totalsOrigins?.[selection];
                  const label =
                    selection === "OVER"
                      ? `Over ${match.totals?.point?.toFixed(1) ?? "-"}`
                      : `Under ${match.totals?.point?.toFixed(1) ?? "-"}`;

                  return `
                    <button
                      class="odd-button ${totalsDraft.selection === selection ? "selected" : ""}"
                      type="button"
                      data-match-id="${escapeHtml(match.id)}"
                      data-market-type="totals"
                      data-selection="${selection}"
                      ${selectionDisabled(match, "totals", selection, existingTotals) ? "disabled" : ""}
                    >
                      <strong>${escapeHtml(label)}</strong>
                      <span>${match.totals?.[selection] ? match.totals[selection].toFixed(2) : "No odds"}</span>
                      <span>${origin ? `Best from ${escapeHtml(origin)}` : "Unavailable"}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
            <div class="bet-action-bar">
              <label class="field" for="stake-${escapeHtml(match.id)}-totals">
                <span>Stake</span>
                <input
                  id="stake-${escapeHtml(match.id)}-totals"
                  type="number"
                  min="10"
                  max="${simpleConfig.maxStake}"
                  value="${escapeHtml(totalsDraft.stake)}"
                  data-stake-input="true"
                  data-match-id="${escapeHtml(match.id)}"
                  data-market-type="totals"
                />
              </label>
              <button
                class="button primary"
                type="button"
                data-place-bet="true"
                data-match-id="${escapeHtml(match.id)}"
                data-market-type="totals"
                ${canPlaceDraft(match, "totals", existingTotals) ? "" : "disabled"}
              >
                Place bet
              </button>
            </div>
            <div class="small-note">
              ${
                existingTotals
                  ? `Already bet: ${escapeHtml(existingTotals.selectionLabel)} at ${existingTotals.odds.toFixed(2)}`
                  : !state.account
                    ? "Log in first to place a bet."
                    : marketLocked(match)
                      ? "Betting is locked because kickoff has passed."
                    : !match.totals?.OVER
                      ? "This bookmaker feed does not have a live over/under line for the match yet."
                      : !totalsDraft.selection
                        ? "1. Choose over or under. 2. Enter a stake. 3. Press Place bet."
                        : `Selected: ${escapeHtml(selectionLabel(match, totalsDraft.selection, "totals"))}. Press Place bet to confirm.`
              }
            </div>
          </div>
          ${quoteMarkup(match)}
          <div class="small-note">One result bet and one totals bet can be active on the same match.</div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-selection]").forEach((button) => {
    button.addEventListener("click", () => {
      const matchId = button.dataset.matchId;
      const marketType = button.dataset.marketType || "match_result";
      const selection = button.dataset.selection;
      updateBetDraft(matchId, marketType, { selection });
      renderMatches();
    });
  });

  document.querySelectorAll("[data-stake-input='true']").forEach((input) => {
    input.addEventListener("input", () => {
      updateBetDraft(input.dataset.matchId, input.dataset.marketType, { stake: input.value });
    });
  });

  document.querySelectorAll("[data-place-bet='true']").forEach((button) => {
    button.addEventListener("click", async () => {
      const matchId = button.dataset.matchId;
      const marketType = button.dataset.marketType || "match_result";
      const draft = getBetDraft(matchId, marketType);
      const match = state.matches.find((item) => item.id === matchId);
      await placeBet(match, draft.selection, draftStakeNumber(matchId, marketType), marketType);
    });
  });
}

function canDeleteBet(bet) {
  return !marketLocked(bet);
}

async function placeBet(match, selection, stake, marketType) {
  if (!state.account || !state.supabase) {
    return;
  }

  if (marketLocked(match)) {
    alert("That market is locked already, so no new bets can be placed on it.");
    return;
  }

  if (stake < 10 || stake > simpleConfig.maxStake) {
    alert(`Stake must be between 10 GOON and ${formatMoney(simpleConfig.maxStake)}.`);
    return;
  }

  if (stake > bankrollLeft()) {
    alert("Not enough bankroll left for that bet.");
    return;
  }

  if (findExistingBet(match.id, marketType)) {
    alert("You already placed a bet on that market for this match.");
    return;
  }

  const marketOdds = selectionPrice(match, marketType, selection);
  if (!marketOdds) {
    alert("There is no live price for that outcome yet.");
    return;
  }

  const payload = {
    away: match.away,
    bookmaker: selectionOrigin(match, marketType, selection),
    home: match.home,
    kickoff: match.kickoff,
    market_line: marketType === "totals" ? match.totals?.point ?? null : null,
    market_type: marketType,
    match_id: match.id,
    odds: Number(marketOdds),
    odds_source: match.oddsSource,
    selection,
    selection_label: selectionLabel(match, selection, marketType),
    stake,
    user_id: state.account.id,
  };

  const { data, error } = await state.supabase.from("bets").insert(payload).select("*").single();

  if (error) {
    if (error.code === "23505") {
      alert("You already placed a bet on that market for this match.");
      return;
    }

    if (/market_type|market_line|schema cache|bets_market_type_check|bets_selection_check/i.test(error.message)) {
      alert("Your Supabase table is missing the newest betting columns or market rules. Re-run the latest schema.sql in Supabase, then try again.");
      return;
    }

    alert(error.message);
    return;
  }

  const normalizedBet = normalizeBet(data);
  state.bets = [normalizedBet, ...state.bets];
  state.publicBets = [
    {
      ...normalizedBet,
      displayName: state.account.name,
      userId: state.account.id,
    },
    ...state.publicBets,
  ];
  clearBetDraft(match.id, marketType);
  recalculatePublicBoard();
  setAuthMessage("Bet placed.");
  renderApp();
}

async function removeBet(bet) {
  if (!state.account || !state.supabase) {
    return;
  }

  if (!canDeleteBet(bet)) {
    alert("That match has already started, so the bet is locked.");
    return;
  }

  const confirmed = confirm(`Remove this bet on ${bet.selectionLabel}?`);
  if (!confirmed) {
    return;
  }

  let deletedBetId = null;
  const rpcResult = await state.supabase.rpc("delete_unlocked_bet", {
    target_bet_id: bet.id,
  });

  if (!rpcResult.error) {
    deletedBetId = rpcResult.data;
  } else if (!/delete_unlocked_bet|function|schema cache/i.test(rpcResult.error.message)) {
    if (/row-level security|policy|permission/i.test(rpcResult.error.message)) {
      alert("The bet was not removed in Supabase. It is either already locked, belongs to a different user session, or your database rules still need the latest schema update.");
      return;
    }

    alert(rpcResult.error.message);
    return;
  }

  if (!deletedBetId) {
    const fallbackResult = await state.supabase
      .from("bets")
      .delete()
      .eq("id", bet.id)
      .eq("user_id", state.account.id)
      .gt("kickoff", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (fallbackResult.error) {
      if (/row-level security|policy|permission|json object requested|single json object/i.test(fallbackResult.error.message)) {
        alert("The bet was not removed in Supabase. Run the new delete SQL fix in Supabase, then try again.");
        return;
      }

      alert(fallbackResult.error.message);
      return;
    }

    deletedBetId = fallbackResult.data?.id ?? null;
  }

  if (!deletedBetId) {
    alert("The bet was not removed in Supabase. Run the new delete SQL fix in Supabase, refresh, and try again.");
    return;
  }

  state.bets = await loadBets();
  await loadPublicPool();
  recalculatePublicBoard();
  setAuthMessage("Bet removed.");
  renderApp();
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard");

  if (!state.supabaseConfigured) {
    container.innerHTML = `<div class="empty-state">Add Supabase public keys to turn on the public leaderboard.</div>`;
    return;
  }

  if (state.publicPoolMessage) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(state.publicPoolMessage)}</div>`;
    return;
  }

  const leaderboard = state.publicBoard.leaderboard;

  if (!leaderboard.length) {
    container.innerHTML = `<div class="empty-state">No players are on the board yet. Create the first account to kick things off.</div>`;
    return;
  }

  const leader = leaderboard[0];

  container.innerHTML = `
    <article class="leader-highlight">
      <div class="small-note">Current leader</div>
      <h3>${escapeHtml(leader.displayName)}</h3>
      <div class="bet-row">
        <span>Total GOON</span>
        <strong>${escapeHtml(formatMoney(leader.contestValue))}</strong>
      </div>
      <div class="bet-row">
        <span>In active bets</span>
        <strong class="amount-bad">${escapeHtml(formatMoney(leader.activeStake))}</strong>
      </div>
      <div class="bet-row">
        <span>Available now</span>
        <strong class="amount-good">${escapeHtml(formatMoney(leader.availableCash))}</strong>
      </div>
    </article>
    <div class="leaderboard-list">
      ${leaderboard
        .map(
          (player) => `
            <article class="leader-row ${state.account?.id === player.id ? "current-user" : ""}">
              <span class="leader-rank">${player.rank}</span>
              <div class="leader-copy">
                <div class="leader-name">${escapeHtml(player.displayName)}${state.account?.id === player.id ? " (you)" : ""}</div>
                <div class="leader-meta">${player.activeBetCount} active bets | ${player.wonCount} wins | ${player.totalBets} total bets</div>
              </div>
              <div class="leader-total">
                <strong>${escapeHtml(formatMoney(player.contestValue))}</strong>
                <span class="leader-meta">${escapeHtml(formatMoney(player.activeStake))} active</span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderActivityLog() {
  const container = document.getElementById("activity-log");

  if (!state.supabaseConfigured) {
    container.innerHTML = `<div class="empty-state">Add Supabase public keys to turn on the winnings feed.</div>`;
    return;
  }

  if (state.publicPoolMessage) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(state.publicPoolMessage)}</div>`;
    return;
  }

  const activity = state.publicBoard.activity;

  if (!activity.length) {
    container.innerHTML = `<div class="empty-state">No activity yet. Once bets come in and matches finish, this feed will show who won what.</div>`;
    return;
  }

  container.innerHTML = activity
    .map(
      (event) => `
        <article class="activity-entry ${escapeHtml(event.type)}">
          <div class="activity-avatar">${escapeHtml(event.displayName.slice(0, 1).toUpperCase())}</div>
          <div class="activity-bubble">
            <div class="activity-meta">
              <strong>${escapeHtml(event.displayName)}</strong>
              <span>${escapeHtml(formatKickoff(event.time))}</span>
            </div>
            <div class="activity-title">${escapeHtml(event.title)}</div>
            <div class="activity-detail">${escapeHtml(event.detail)}</div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMyBets() {
  const container = document.getElementById("my-bets");

  if (!state.supabaseConfigured) {
    container.innerHTML = `<div class="empty-state">Add Supabase public keys to turn on real accounts and fake-money bets.</div>`;
    return;
  }

  if (!state.account) {
    container.innerHTML = `<div class="empty-state">Log in to see your personal bet list and bankroll.</div>`;
    return;
  }

  if (!state.bets.length) {
    container.innerHTML = `<div class="empty-state">No bets placed yet. Pick a weekly match, choose an outcome, type your stake, and confirm the bet.</div>`;
    return;
  }

  container.innerHTML = ownBetEvaluations()
    .slice()
    .sort((left, right) => new Date(right.bet.placedAt) - new Date(left.bet.placedAt))
    .map(({ bet, settlement }) => {
      const marketLabel = betMarketLabel(bet);
      const payoutMarkup = settlement.isSettled
        ? `
          <div class="bet-row">
            <span>${settlement.result === "WON" ? "Return" : settlement.result === "PUSH" ? "Returned" : "Lost"}</span>
            <strong class="${settlement.result === "WON" ? "amount-good" : settlement.result === "PUSH" ? "" : "amount-bad"}">
              ${escapeHtml(
                settlement.result === "LOST"
                  ? formatMoney(bet.stake)
                  : formatMoney(settlement.payout),
              )}
            </strong>
          </div>
          <div class="small-note">${
            settlement.future
              ? `Settled winner: ${escapeHtml(futureResultLabel(settlement.future))}`
              : `Final score: ${escapeHtml(scorelineLabel(settlement.match))}`
          }</div>
        `
        : "";

      const statusLabel = settlement.isSettled
        ? settlement.result === "WON"
          ? "Won"
          : settlement.result === "PUSH"
            ? "Push"
            : "Lost"
        : canDeleteBet(bet)
          ? "Editable"
          : "Locked";

      return `
        <article class="bet-card">
          <div class="small-note">${escapeHtml(formatKickoff(bet.kickoff))}</div>
          <h3>${escapeHtml(betDisplayTitle(bet))}</h3>
          ${isFutureMarketType(bet.marketType) ? `<div class="small-note">${escapeHtml(bet.away)}</div>` : ""}
          <div class="bet-row">
            <span>Market</span>
            <strong>${escapeHtml(marketLabel)}</strong>
          </div>
          <div class="bet-row">
            <span>Pick</span>
            <strong>${escapeHtml(bet.selectionLabel)}</strong>
          </div>
          <div class="bet-row">
            <span>Coefficient</span>
            <strong>${bet.odds.toFixed(2)}</strong>
          </div>
          <div class="bet-row">
            <span>Bookmaker</span>
            <strong>${escapeHtml(bet.bookmaker ?? "-")}</strong>
          </div>
          <div class="bet-row">
            <span>Stake</span>
            <strong>${escapeHtml(formatMoney(bet.stake))}</strong>
          </div>
          <div class="bet-row">
            <span>Status</span>
            <strong>${escapeHtml(statusLabel)}</strong>
          </div>
          ${payoutMarkup}
          ${
            !settlement.isSettled && canDeleteBet(bet)
              ? `
                <button class="button ghost" type="button" data-delete-bet="${escapeHtml(bet.id)}">
                  Remove bet
                </button>
              `
              : !settlement.isSettled
                ? `<div class="small-note">Kickoff has passed, so this bet cannot be removed.</div>`
                : ""
          }
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-bet]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bet = state.bets.find((item) => item.id === button.dataset.deleteBet);
      if (!bet) {
        return;
      }
      await removeBet(bet);
    });
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  return data;
}

async function loadMatches() {
  let result;

  try {
    result = await fetchJson("/api/matches");
  } catch (error) {
    result = defaultMatchPayload(`Fell back to demo matches because /api/matches failed: ${error.message}`);
  }

  state.matches = (result.matches ?? []).map(normalizeMatch);
  state.meta = {
    ...defaultMeta(),
    ...(result.meta ?? {}),
  };

  const validWeeks = new Set(availableWeeks().map((week) => week.id));
  if (!validWeeks.has(state.selectedWeek)) {
    state.selectedWeek = "all";
  }

  recalculatePublicBoard();
}

function loadFutures() {
  state.futures = demoFutures.map(normalizeFutureMarket);
  recalculatePublicBoard();
}

function deriveProfileName(user) {
  return (
    user.user_metadata?.username ||
    user.user_metadata?.display_name ||
    emailToUsername(user.email) ||
    "player"
  );
}

async function ensureProfile(user) {
  const displayName = deriveProfileName(user);

  const { data, error } = await state.supabase
    .from("profiles")
    .upsert(
      {
        display_name: displayName,
        email: user.email,
        id: user.id,
      },
      { onConflict: "id" },
    )
    .select("id, email, display_name")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function loadBets() {
  const { data, error } = await state.supabase
    .from("bets")
    .select("*")
    .order("placed_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeBet);
}

async function loadPublicPool() {
  if (!state.supabaseConfigured || !state.supabase) {
    state.publicPlayers = [];
    state.publicBets = [];
    state.publicPoolMessage = "";
    recalculatePublicBoard();
    return;
  }

  const [playersResult, betsResult] = await Promise.all([
    state.supabase.rpc("get_public_players"),
    state.supabase.rpc("get_public_bets"),
  ]);

  const error = playersResult.error ?? betsResult.error;

  if (error) {
    state.publicPlayers = [];
    state.publicBets = [];
    state.publicPoolMessage = /get_public_|schema cache|function/i.test(error.message)
      ? "Run the latest schema.sql in Supabase to turn on the public leaderboard and winnings feed."
      : error.message;
    recalculatePublicBoard();
    return;
  }

  state.publicPlayers = (playersResult.data ?? []).map(normalizePublicPlayer);
  state.publicBets = (betsResult.data ?? []).map(normalizeBet);
  state.publicPoolMessage = "";
  recalculatePublicBoard();
}

async function syncSession(session) {
  if (!state.supabaseConfigured || !state.supabase) {
    state.account = null;
    state.bets = [];
    state.betDrafts = {};
    recalculatePublicBoard();
    renderApp();
    return;
  }

  if (!session?.user) {
    state.account = null;
    state.bets = [];
    state.betDrafts = {};
    await loadPublicPool();
    renderApp();
    return;
  }

  const profile = await ensureProfile(session.user);
  state.account = {
    email: profile.email,
    id: profile.id,
    name: profile.display_name,
    username: deriveProfileName(session.user),
  };
  state.bets = await loadBets();
  await loadPublicPool();
  setAuthMessage("");
  renderApp();
}

async function setupSupabase() {
  state.supabaseConfigured = hasSupabaseConfig();

  if (!state.supabaseConfigured) {
    return;
  }

  const config = readPublicConfig();
  state.supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  state.supabase.auth.onAuthStateChange((event, session) => {
    syncSession(session).catch((error) => {
      setAuthMessage(error.message);
    });

    if (event === "SIGNED_IN") {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = "";
      window.history.replaceState({}, document.title, cleanUrl.toString());
    }
  });

  const {
    data: { session },
  } = await state.supabase.auth.getSession();
  await syncSession(session);
}

async function submitCreateAccount() {
  if (!state.supabaseConfigured || !state.supabase) {
    return;
  }

  const credentials = readCredentialsFromForm();
  setAuthBusy(true);
  setAuthMessage(`Creating account for ${credentials.username}...`);

  try {
    const { data, error } = await state.supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          display_name: credentials.username,
          username: credentials.username,
        },
      },
    });

    if (error) {
      if (/already registered/i.test(error.message)) {
        setAuthMessage("That username already exists. Try logging in instead.");
        return;
      }

      setAuthMessage(error.message);
      return;
    }

    if (!data.session) {
      setAuthMessage(
        "Account created, but Supabase still requires email confirmation. In Supabase Auth Providers, turn off Confirm email for password logins, then try logging in.",
      );
      return;
    }

    await syncSession(data.session);
    setAuthMessage(`Account created. You are now signed in as ${credentials.username}.`);
  } finally {
    setAuthBusy(false);
  }
}

async function submitPasswordLogin() {
  if (!state.supabaseConfigured || !state.supabase) {
    return;
  }

  const credentials = readCredentialsFromForm();
  setAuthBusy(true);
  setAuthMessage(`Logging in as ${credentials.username}...`);

  try {
    const { data, error } = await state.supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      setAuthMessage("Wrong username or password.");
      return;
    }

    await syncSession(data.session);
    setAuthMessage(`Signed in as ${credentials.username}.`);
  } finally {
    setAuthBusy(false);
  }
}

function attachEvents() {
  const form = document.getElementById("login-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitPasswordLogin().catch((error) => {
      setAuthBusy(false);
      setAuthMessage(error.message);
    });
  });

  document.getElementById("create-account-button").addEventListener("click", () => {
    submitCreateAccount().catch((error) => {
      setAuthBusy(false);
      setAuthMessage(error.message);
    });
  });

  document.getElementById("login-button").addEventListener("click", () => {
    submitPasswordLogin().catch((error) => {
      setAuthBusy(false);
      setAuthMessage(error.message);
    });
  });

  document.getElementById("search-input").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderMatches();
  });
}

function renderApp() {
  syncHero();
  renderAuthControls();
  renderAccount();
  renderBoardTabs();
  renderBoardPanels();
  renderWeeks();
  renderFutureMarkets();
  renderMatches();
  renderLeaderboard();
  renderActivityLog();
  renderMyBets();
  renderAuthStatus();
}

async function start() {
  attachEvents();
  loadFutures();
  await loadMatches();
  await setupSupabase();
  renderApp();
}

start().catch((error) => {
  document.getElementById("match-list").innerHTML = `
    <div class="empty-state">Could not load matches: ${escapeHtml(error.message)}</div>
  `;
});
