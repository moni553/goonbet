# Data Sources

This simplified build now supports real live fetching.

## Fixtures

Primary fixture source:

- `football-data.org`

What it supplies:

- Match schedule
- Kickoff times
- Competition and stage context
- Match status and results

Current implementation:

- Server requests competition matches from `/v4/competitions/{code}/matches`
- Uses `dateFrom` and `dateTo` to pull a rolling upcoming window

## Odds

Primary odds source:

- `The Odds API`

What it supplies:

- Live and upcoming `1X2` coefficients
- Multiple bookmakers per event
- Decimal odds

Current implementation:

- Server requests `/v4/sports/{sportKey}/odds`
- Uses `markets=h2h`
- Uses `oddsFormat=decimal`
- Merges bookmaker quotes into best extracted home/draw/away prices

## Merge model

The server:

1. Fetches fixture rows
2. Fetches bookmaker odds rows
3. Matches them by normalized home team, away team, and kickoff proximity
4. Groups the result by week for the UI
5. Falls back to demo data if live rows are unavailable

## Keys

Use `.env` with:

- `FOOTBALL_DATA_API_TOKEN`
- `FOOTBALL_DATA_COMPETITION`
- `THE_ODDS_API_KEY`
- `ODDS_API_SPORT_KEY`
- `ODDS_API_REGIONS`
- `ODDS_API_BOOKMAKERS`
