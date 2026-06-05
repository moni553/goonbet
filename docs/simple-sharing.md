# Simple Sharing Guide

This version can now use real live fixture and odds feeds, but the sharing model stays simple.

## Local

Run:

```bash
node server.mjs
```

Open:

```text
http://localhost:4173
```

## Public sharing

The easiest way to share this exact version is still to deploy the Node app to `Render`.

Why Render fits:

- This app uses a Node server
- The Node server fetches live provider data and stores shared bets
- Render gives you a public URL
- Render lets you configure environment variables for provider keys

## Render setup

1. Push the project to GitHub
2. Create a Render Web Service
3. Connect the repo
4. Add environment variables from `.env.example`
5. Set build command to `npm install`
6. Set start command to `node server.mjs`
7. Open the public URL and test login, matches, and odds
8. Send the URL to your friends

## Important note

This version still stores accounts and bets in `work/simple-db.json`.

That is okay for:

- Small private groups
- Fast testing
- MVP usage

If you want stronger shared persistence later, move accounts and bets to `Supabase` or another hosted database.
