const selectionLabels = {
  AWAY: "Away win",
  DRAW: "Draw",
  HOME: "Home win",
};

function roundMoney(value) {
  return Math.round(value);
}

export function formatMoney(value) {
  return `FC ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

export function formatKickoff(value) {
  return new Intl.DateTimeFormat("en-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function getMatchOutcome(match) {
  if (match.status !== "FINAL" || !match.score) {
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

export function describePick(bet, match) {
  if (bet.pick.type === "EXACT_SCORE") {
    return `Exact ${bet.pick.home}-${bet.pick.away}`;
  }

  if (bet.pick.selection === "HOME") {
    return `${match.home} win`;
  }

  if (bet.pick.selection === "AWAY") {
    return `${match.away} win`;
  }

  return "Draw";
}

export function labelStatus(status) {
  switch (status) {
    case "FINAL":
      return "Final";
    case "LIVE":
      return "Live";
    case "LOCKED":
      return "Locked";
    default:
      return "Scheduled";
  }
}

export function settleBet(bet, match, rules) {
  const outcome = getMatchOutcome(match);

  if (!outcome) {
    return {
      payout: 0,
      result: "OPEN",
      isSettled: false,
      won: false,
      oddsLabel: bet.pick.type === "EXACT_SCORE" ? `x${rules.exactScoreMultiplier}` : `x${match.odds[bet.pick.selection]}`,
    };
  }

  if (bet.pick.type === "EXACT_SCORE") {
    const won = match.score.home === bet.pick.home && match.score.away === bet.pick.away;
    return {
      payout: won ? roundMoney(bet.stake * rules.exactScoreMultiplier) : 0,
      result: won ? "WON" : "LOST",
      isSettled: true,
      won,
      oddsLabel: `x${rules.exactScoreMultiplier}`,
    };
  }

  const won = bet.pick.selection === outcome;
  const multiplier = match.odds[bet.pick.selection] ?? 2;
  return {
    payout: won ? roundMoney(bet.stake * multiplier) : 0,
    result: won ? "WON" : "LOST",
    isSettled: true,
    won,
    oddsLabel: `x${multiplier}`,
  };
}

export function buildTournamentState({ tournament, players, matches, bets }) {
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const playerMap = new Map(players.map((player) => [player.id, player]));

  const evaluations = bets.map((bet) => {
    const match = matchMap.get(bet.matchId);
    const player = playerMap.get(bet.playerId);
    const settlement = settleBet(bet, match, tournament.rules);
    const net = settlement.isSettled ? settlement.payout - bet.stake : 0;

    return {
      ...bet,
      ...settlement,
      net,
      match,
      player,
      pickLabel: describePick(bet, match),
    };
  });

  const leaderboard = players
    .map((player) => {
      const playerBets = evaluations.filter((bet) => bet.playerId === player.id);
      const openStake = playerBets.filter((bet) => !bet.isSettled).reduce((sum, bet) => sum + bet.stake, 0);
      const settledProfit = playerBets.filter((bet) => bet.isSettled).reduce((sum, bet) => sum + bet.net, 0);
      const wonCount = playerBets.filter((bet) => bet.result === "WON").length;
      const lostCount = playerBets.filter((bet) => bet.result === "LOST").length;
      const pendingCount = playerBets.filter((bet) => bet.result === "OPEN").length;
      const availableCash = tournament.rules.startingBankroll + settledProfit - openStake;
      const contestValue = tournament.rules.startingBankroll + settledProfit;

      return {
        ...player,
        availableCash,
        contestValue,
        openStake,
        settledProfit,
        wonCount,
        lostCount,
        pendingCount,
      };
    })
    .sort((left, right) => {
      if (right.contestValue !== left.contestValue) {
        return right.contestValue - left.contestValue;
      }

      if (right.wonCount !== left.wonCount) {
        return right.wonCount - left.wonCount;
      }

      return left.name.localeCompare(right.name);
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  const matchesWithBets = matches
    .map((match) => ({
      ...match,
      bets: evaluations.filter((bet) => bet.matchId === match.id),
    }))
    .sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff));

  const openMatches = matchesWithBets.filter((match) => match.status !== "FINAL");

  const recentResults = evaluations
    .filter((bet) => bet.isSettled)
    .sort((left, right) => {
      const leftTime = new Date(left.match.kickoff).getTime();
      const rightTime = new Date(right.match.kickoff).getTime();
      return rightTime - leftTime;
    });

  return {
    evaluations,
    leaderboard,
    matchesWithBets,
    openMatches,
    recentResults,
  };
}

export function scorelineLabel(match) {
  if (!match.score) {
    return "No score yet";
  }

  return `${match.score.home} - ${match.score.away}`;
}

export function selectionLabel(selection) {
  return selectionLabels[selection] ?? selection;
}
