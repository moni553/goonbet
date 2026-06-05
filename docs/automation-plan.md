# Automation Plan

This document is the practical path from the current prototype to a mostly hands-off World Cup pool app.

## Best architecture

Recommended stack:

- Front end: `Next.js`
- Auth and database: `Supabase`
- Scheduled jobs: `Supabase Cron`
- Live World Cup data: `Sportmonks`
- Low-cost backup option: `football-data.org`

Why this stack:

- Supabase keeps auth, Postgres, and scheduled jobs in one place
- The app can stay private and invite-only
- Sportmonks gives you more live match detail for World Cup 2026
- The automation can run even when your laptop is asleep

## What to automate

### 1. Fixture import

Run once every morning:

- Pull latest fixtures
- Upsert kickoff times, stages, and match ids
- Create any new match records ahead of the next betting window

### 2. Bet locking

Run every minute on match days:

- Compare current time to kickoff
- Flip the match to `locked` when kickoff is reached
- Prevent new bets for that match immediately

### 3. Live match sync

Run every 60 seconds during active windows:

- Fetch matches that changed
- Update score, match status, and final flag
- Avoid polling all matches every time

### 4. Auto settlement

Run after each sync:

- Find matches that moved to `final`
- Grade all open bets for those matches
- Write payout values
- Refresh leaderboard numbers

### 5. Daily summary

Run every morning:

- Produce latest standings
- Post a digest to your group chat or email
- Mention biggest win, biggest miss, and next matches

## Provider recommendation

Checked June 5, 2026 from official sources.

### Option A: football-data.org

Good for:

- Cheapest MVP
- Delayed or low-frequency updates
- Lightweight fixture and results sync

Current notes:

- Coverage page includes `Worldcup`
- Pricing page says the free plan is free forever
- Policies page says registered free clients get `10 requests/minute`
- Free pricing notes delayed scores and schedules
- FAQ asks you to display attribution

Official docs:

- [Coverage](https://www.football-data.org/coverage)
- [Pricing](https://www.football-data.org/pricing)
- [Policies](https://docs.football-data.org/general/v4/policies.html)
- [FAQ](https://www.football-data.org/documentation/faq)

### Option B: Sportmonks

Good for:

- Real automatic updates during live matches
- More detailed World Cup match state
- Better long-term product feel

Current notes:

- World Cup 2026 docs show `livescores/inplay`, `livescores`, and `livescores/latest`
- The docs say `livescores/latest` is the most efficient polling loop because it returns only recently changed fixtures
- World Cup examples use league id `732`

Official docs:

- [World Cup live matches docs](https://docs.sportmonks.com/v3/world-cup-2026/live-matches-livescores-and-events)
- [Endpoints overview](https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/endpoints)

## Product decisions that keep this simple

- Use fake money only
- Do not add deposits, withdrawals, or real cash prizes
- Start with `1X2` and exact-score bets only
- Skip bookmaker odds in version one unless you really want to pay for that data
- Keep the app invite-only

## Suggested roadmap

### Phase 1

- Real database
- Login
- Match list
- Place bets
- Manual admin fixture import if needed

### Phase 2

- Automatic fixture sync
- Automatic bet lock
- Automatic settlement
- Live leaderboard

### Phase 3

- Knockout-stage specials
- Daily digest posts
- Team pages and stats
- Push notifications
