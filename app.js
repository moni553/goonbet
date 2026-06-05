import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { demoMatches, simpleConfig } from "./data/simple-app-data.js";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const USERNAME_EMAIL_DOMAIN = "players.goonbet.app";

const state = {
  account: null,
  authBusy: false,
  authMessage: "",
  bets: [],
  matches: [],
  meta: defaultMeta(),
  search: "",
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
    weekId: match.weekId ?? "all",
    weekLabel: match.weekLabel ?? "Current week",
  };
}

function normalizeBet(bet) {
  return {
    away: bet.away,
    bookmaker: bet.bookmaker,
    home: bet.home,
    id: bet.id,
    kickoff: bet.kickoff,
    matchId: bet.match_id,
    odds: Number(bet.odds),
    oddsSource: bet.odds_source,
    placedAt: bet.placed_at,
    selection: bet.selection,
    selectionLabel: bet.selection_label,
    stake: Number(bet.stake),
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
  return `${currency.format(value)} GOON`;
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

function totalStakeForAccount() {
  return state.bets.reduce((sum, bet) => sum + bet.stake, 0);
}

function bankrollLeft() {
  return simpleConfig.startingBankroll - totalStakeForAccount();
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

function findExistingBet(matchId) {
  return state.bets.find((bet) => bet.matchId === matchId);
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

function syncHero() {
  const liveCopy = state.meta.usingDemoFallback
    ? "Demo fallback is active right now. Add live provider keys to switch the public board onto real fixtures and coefficients."
    : `Live board is on. Fixtures: ${state.meta.fixtureProvider}. Coefficients: ${state.meta.oddsProvider}.`;

  const betCopy = !state.supabaseConfigured
    ? "Betting is offline until Supabase public keys are configured."
    : state.account
      ? `${state.account.username} is signed in and ready to bet.`
      : "Public viewing is open; betting unlocks after username and password login.";

  document.getElementById("hero-text").textContent = simpleConfig.tagline;
  document.getElementById("hero-stats").innerHTML = [
    {
      title: "Weeks",
      copy: `${Math.max(availableWeeks().length - 1, 0)} weekly buckets loaded.`,
    },
    {
      title: "Matches",
      copy: `${state.matches.length} matches currently on the board.`,
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
        Guests can browse every weekly match. Bettors create a username and password, then place one fake-money bet per match.
      </div>
    `;
    return;
  }

  card.innerHTML = `
    <div class="bet-row">
      <span>Signed in as</span>
      <strong>${escapeHtml(state.account.username)}</strong>
    </div>
    <div class="bet-row">
      <span>Profile name</span>
      <strong>${escapeHtml(state.account.name)}</strong>
    </div>
    <div class="bet-row">
      <span>Starting bankroll</span>
      <strong>${escapeHtml(formatMoney(simpleConfig.startingBankroll))}</strong>
    </div>
    <div class="bet-row">
      <span>Reserved on bets</span>
      <strong class="amount-bad">${escapeHtml(formatMoney(totalStakeForAccount()))}</strong>
    </div>
    <div class="bet-row">
      <span>Bankroll left</span>
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

function oddsDisabled(match, existing) {
  return !state.account || Boolean(existing) || !match.odds.HOME || !match.odds.DRAW || !match.odds.AWAY;
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
              <strong>H ${quote.odds.HOME?.toFixed(2) ?? "-"} | D ${quote.odds.DRAW?.toFixed(2) ?? "-"} | A ${quote.odds.AWAY?.toFixed(2) ?? "-"}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
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
      const existing = findExistingBet(match.id);
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
          <div class="small-note">${escapeHtml(match.oddsDetail)}</div>
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
                    class="odd-button"
                    type="button"
                    data-match-id="${escapeHtml(match.id)}"
                    data-selection="${selection}"
                    ${oddsDisabled(match, existing) ? "disabled" : ""}
                  >
                    <strong>${escapeHtml(labels[selection])}</strong>
                    <span>${match.odds[selection] ? match.odds[selection].toFixed(2) : "No odds"}</span>
                    <span>${origin ? `Best from ${escapeHtml(origin)}` : "Unavailable"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
          ${quoteMarkup(match)}
          <div class="stake-bar">
            <label class="field" for="stake-${escapeHtml(match.id)}">
              <span>Stake</span>
              <input id="stake-${escapeHtml(match.id)}" type="number" min="10" max="${simpleConfig.maxStake}" value="${simpleConfig.defaultStake}" />
            </label>
            <div class="small-note">
              ${
                existing
                  ? `Already bet: ${escapeHtml(existing.selectionLabel)} at ${existing.odds.toFixed(2)}`
                  : !state.account
                    ? "Log in first to place a bet."
                    : !match.odds.HOME
                      ? "Fixture loaded, but there are no live 1X2 prices yet."
                      : "Tap an outcome to place your bet."
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-selection]").forEach((button) => {
    button.addEventListener("click", async () => {
      const matchId = button.dataset.matchId;
      const selection = button.dataset.selection;
      const match = state.matches.find((item) => item.id === matchId);
      const stake = Number(document.getElementById(`stake-${matchId}`).value || 0);
      await placeBet(match, selection, stake);
    });
  });
}

function selectionLabel(match, selection) {
  if (selection === "HOME") {
    return `${match.home} win`;
  }
  if (selection === "AWAY") {
    return `${match.away} win`;
  }
  return "Draw";
}

async function placeBet(match, selection, stake) {
  if (!state.account || !state.supabase) {
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

  if (findExistingBet(match.id)) {
    alert("You already placed a bet on that match.");
    return;
  }

  if (!match.odds[selection]) {
    alert("There is no live price for that outcome yet.");
    return;
  }

  const payload = {
    away: match.away,
    bookmaker: match.oddsOrigins?.[selection] ?? match.bookmaker,
    home: match.home,
    kickoff: match.kickoff,
    match_id: match.id,
    odds: Number(match.odds[selection]),
    odds_source: match.oddsSource,
    selection,
    selection_label: selectionLabel(match, selection),
    stake,
    user_id: state.account.id,
  };

  const { data, error } = await state.supabase.from("bets").insert(payload).select("*").single();

  if (error) {
    if (error.code === "23505") {
      alert("You already placed a bet on that match.");
      return;
    }

    alert(error.message);
    return;
  }

  state.bets = [normalizeBet(data), ...state.bets];
  setAuthMessage("Bet placed.");
  renderApp();
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
    container.innerHTML = `<div class="empty-state">No bets placed yet. Pick a weekly match and tap one of the live coefficients.</div>`;
    return;
  }

  container.innerHTML = state.bets
    .slice()
    .sort((left, right) => new Date(right.placedAt) - new Date(left.placedAt))
    .map(
      (bet) => `
        <article class="bet-card">
          <div class="small-note">${escapeHtml(formatKickoff(bet.kickoff))}</div>
          <h3>${escapeHtml(bet.home)} vs ${escapeHtml(bet.away)}</h3>
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
        </article>
      `,
    )
    .join("");
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

async function syncSession(session) {
  if (!state.supabaseConfigured || !session?.user) {
    state.account = null;
    state.bets = [];
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
  renderWeeks();
  renderMatches();
  renderMyBets();
  renderAuthStatus();
}

async function start() {
  attachEvents();
  await loadMatches();
  await setupSupabase();
  renderApp();
}

start().catch((error) => {
  document.getElementById("match-list").innerHTML = `
    <div class="empty-state">Could not load matches: ${escapeHtml(error.message)}</div>
  `;
});
