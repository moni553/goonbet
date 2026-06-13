# GoonBet

GoonBet is a simpler World Cup fake-money betting site:

- public weekly match board
- search by team, group, bookmaker, or week
- real Pinnacle coefficients for `1X2`, goals over/under, player bookings, and red cards
- real tournament-special coefficients for World Cup winner and top scorer
- Supabase-backed bettor accounts with username-plus-password sign-in
- one fake-money bet per user per match

## How it works

- The site is public, so anyone with the link can open the match board.
- Live fixtures come from `football-data.org`.
- Live default coefficients come from Pinnacle's public guest feed.
- The Node server merges those feeds and serves the board at `/api/matches`.
- Tournament specials come from Pinnacle's public guest feed and are served at `/api/futures`.
- Supabase stores signed-in bettor profiles and fake-money bets.

## Recommended free-only setup

For a small private group, the safest low-cost setup is:

- `football-data.org` for fixtures and results
- Pinnacle guest feed for match coefficients and futures
- slower server caching so your friends all hit the same cached response instead of hammering live endpoints

Recommended environment values:

- `ODDS_PROVIDER=pinnacle_guest`
- `PINNACLE_WORLD_CUP_LEAGUE_ID=2686`
- `ENABLE_FUTURES=true`
- `MATCH_LOOKAHEAD_DAYS=7`
- `MATCH_CACHE_TTL_SECONDS=10800`
- `FUTURE_CACHE_TTL_SECONDS=43200`

That means:

- match data refreshes every 3 hours
- long-term markets refresh every 12 hours if enabled
- the board only looks one week ahead by default
- direct Pinnacle player-booking, red-card, winner, and top-scorer markets stay live without needing a paid odds key

## Local setup

Create a local `.env` file from `.env.example`.

Required for real betting accounts:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Required for live match data:

- `FOOTBALL_DATA_API_TOKEN`

Recommended for a small friends-only pool:

- `ODDS_PROVIDER=pinnacle_guest`
- `PINNACLE_WORLD_CUP_LEAGUE_ID=2686`
- `ENABLE_FUTURES=true`
- `MATCH_LOOKAHEAD_DAYS=7`
- `MATCH_CACHE_TTL_SECONDS=10800`
- `FUTURE_CACHE_TTL_SECONDS=43200`

Optional fallback if you still want to keep `The Odds API` available:

- `THE_ODDS_API_KEY`
- `ODDS_API_OUTRIGHTS_SPORT_KEY`
- `ODDS_API_WINNER_SPORT_KEY`
- `ODDS_API_TOP_SCORER_SPORT_KEY`
- `ODDS_API_FUTURES_BOOKMAKERS`

Notes on the current Pinnacle-backed setup:

- `1X2` and `goals O/U` come from direct Pinnacle match markets.
- `player to be booked` and `either team to get a red card` come from direct Pinnacle special markets.
- `world cup winner` and `top scorer` come from direct Pinnacle future markets.
- `yellow card totals` and `shots on target` stay unavailable unless a real live feed exposes them for World Cup matches.

Run the site:

```bash
node server.mjs
```

Then open `http://localhost:4173`.

## Supabase setup

1. Create a Supabase project.
2. Run the SQL in `supabase/schema.sql`.
3. In `Auth -> URL Configuration`, add:
   - `http://localhost:4173`
   - your future public site URL, for example `https://goonbet.onrender.com`
4. In `Auth -> Providers -> Email`, allow email/password sign-in.
5. If you want instant username/password signup without email confirmation, turn off `Confirm email`.

## Public deployment

This project is set up to deploy cleanly as a Render web service.

- `render.yaml` defines the web service and required environment variables.
- The public site is served by `server.mjs`.
- Browser-side Supabase config is exposed through `/app-config.js`.

Once deployed, you share the Render URL or your custom domain with friends. Everyone can browse the board. Anyone who wants to bet creates a username and password, then places bets from their own account.

## Main files

- `index.html`, `styles.css`, `app.js`: public board and bettor UI
- `server.mjs`: static server, live feed merge, and public config endpoint
- `supabase/schema.sql`: Supabase tables, trigger, and RLS policies
- `render.yaml`: public deployment blueprint for Render
- `data/simple-app-data.js`: fallback demo data and app constants

## Official docs checked on June 5, 2026

- Supabase passwordless email login: [docs](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Supabase Auth overview: [docs](https://supabase.com/docs/guides/auth/)
- Supabase RLS: [docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Render Node web services: [docs](https://render.com/docs/deploy-node-express-app)
- Render custom domains: [docs](https://render.com/docs/custom-domains/)
- Render Blueprints: [docs](https://render.com/docs/blueprint-spec)
- football-data.org quickstart: [docs](https://www.football-data.org/documentation/quickstart)
- The Odds API overview: [docs](https://the-odds-api.com/sports-odds-data/)
