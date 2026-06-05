# Public Launch Plan

This is the best way to make the app reachable by everyone while still protecting the actual betting actions.

## Best structure

Use a split between public content and private actions.

Public:

- Home page
- Fixture list
- Match pages
- Leaderboard
- Rules page

Private:

- Place bet
- Edit or cancel allowed bets
- Personal history
- Admin pages

## Best deployment path

Recommended:

- Front end on `Vercel`
- Database, auth, and cron jobs on `Supabase`
- Live match sync via `Sportmonks`

Cheaper static-first option:

- Front end on `Cloudflare Pages`
- Database and auth on `Supabase`
- Delayed results via `football-data.org`

## Why Vercel is the best fit

Checked on June 5, 2026 from official docs:

- Vercel supports Git-based deployments and CLI deployments
- Connected Git repositories automatically redeploy on pushes and pull requests
- Vercel supports custom domains

Official docs:

- [Deployment methods](https://vercel.com/docs/deployments/deployment-methods)
- [CLI deploy](https://vercel.com/docs/cli/deploy)
- [Custom domains](https://vercel.com/docs/domains/set-up-custom-domain)

## Why Cloudflare Pages is a good fallback

Checked on June 5, 2026 from official docs:

- Cloudflare Pages supports static HTML sites
- You can import a Git repository or upload prebuilt assets
- Each project gets a public `*.pages.dev` URL

Official docs:

- [Pages overview](https://developers.cloudflare.com/pages)
- [Static HTML deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)

## Login recommendation

Use `Supabase Auth` with Magic Links:

- Easier for friends than passwords
- Good for mobile users
- Easy to invite people by email

Official docs:

- [Supabase Auth](https://supabase.com/docs/guides/auth/)
- [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless/)

## Security recommendation

Use `Supabase` Row Level Security:

- Public tables can expose read-only leaderboard and fixture data
- Private tables can restrict bets so each user only accesses their own records
- Admin-only actions can be guarded by policies and server-side functions

Official docs:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Edge Functions auth modes](https://supabase.com/docs/guides/functions/auth)

## Public launch roadmap

### Step 1

- Put the front end on Vercel
- Give it a temporary public URL
- Add a custom domain later if you want branding

### Step 2

- Move from demo data to Supabase data
- Add email login
- Make leaderboard and fixtures public

### Step 3

- Add real bet forms
- Add live result sync
- Add automatic settlement

### Step 4

- Add invitation flow
- Add daily summaries
- Add mobile polish and notifications

## Simple rule for access

Best product rule:

- Everyone can watch
- Only invited friends can bet

That keeps the site easy to share without turning the database into a free-for-all.
