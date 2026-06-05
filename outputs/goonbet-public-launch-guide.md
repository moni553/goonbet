# GoonBet Public Launch Guide

## 1. Create Supabase

1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy your project URL and publishable key.
4. In `Auth -> URL Configuration`, add:
   - `http://localhost:4173`
   - your future public URL, for example `https://goonbet.onrender.com`

## 2. Add your local env file

Create `.env` from `.env.example` and fill in:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `FOOTBALL_DATA_API_TOKEN`
- `THE_ODDS_API_KEY`

Recommended defaults:

- `FOOTBALL_DATA_COMPETITION=WC`
- `ODDS_API_SPORT_KEY=soccer_fifa_world_cup`
- `ODDS_API_REGIONS=eu`

## 3. Run it locally

```bash
node server.mjs
```

Then open `http://localhost:4173`.

## 4. Put it online

Best path for this version:

1. Push the repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Let Render read `render.yaml`.
4. Add the same env vars in Render.
5. Deploy.

Render gives you a public URL like `https://goonbet.onrender.com`.

## 5. Share it with friends

- Send them the public URL.
- Everyone can open the match board without logging in.
- Friends who want to bet enter their name and email.
- Supabase sends them a magic login link.
- After they return to the site, they can place fake-money bets from their own account.

## 6. Optional custom domain

After the site is live, add your own domain in Render, for example:

- `goonbet.com`
- `playgoonbet.com`
- `goonbet.app`

## Official docs checked on June 5, 2026

- [Supabase passwordless email login](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Render Node deploy](https://render.com/docs/deploy-node-express-app)
- [Render custom domains](https://render.com/docs/custom-domains/)
- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
