# World Cup Betting Project Brief

## Best version to build

Build a private fake-money World Cup pool for friends, not a full sportsbook.

- Make the site publicly reachable
- Everyone gets a fake bankroll
- Bet types start with winner and exact score
- Matches lock at kickoff
- Final scores settle bets automatically
- The leaderboard updates itself

That gives you the fun part without the heavy real-money complexity.

Best access model:

- Public pages for everyone to view
- Private betting for invited friends only

## Best stack

Best recommendation:

- `Next.js` on `Vercel` for the real app
- `Supabase` for auth, database, and scheduled jobs
- `Sportmonks` for live World Cup updates

Cheaper MVP:

- `Cloudflare Pages` or `Vercel` for hosting
- `Supabase`
- `football-data.org`
- Lower-frequency updates

## What I already started

- Static front-end prototype
- Fake-money settlement logic
- Demo leaderboard
- Automation blueprint
- Starter Supabase schema

## Official sources checked on June 5, 2026

- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Sportmonks World Cup live docs](https://docs.sportmonks.com/v3/world-cup-2026/live-matches-livescores-and-events)
- [Sportmonks endpoints overview](https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/endpoints)
- [football-data.org pricing](https://www.football-data.org/pricing)
- [football-data.org coverage](https://www.football-data.org/coverage)
- [football-data.org API policies](https://docs.football-data.org/general/v4/policies.html)
- [Vercel deployment methods](https://vercel.com/docs/deployments/deployment-methods)
- [Vercel custom domains](https://vercel.com/docs/domains/set-up-custom-domain)
- [Cloudflare Pages static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [Supabase Auth](https://supabase.com/docs/guides/auth/)
- [Supabase passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Best next step

Turn the prototype into a real public app with login, bet submission, and live sync jobs.
