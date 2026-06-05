import { providerSamples, providerRegistry } from "../data/provider-sources.js";
import { buildFootballDataWorldCupFeed } from "./providers/football-data.mjs";
import { buildSportmonksWorldCupFeed } from "./providers/sportmonks.mjs";

export function createSyncRunbook({ sportmonksApiToken = "YOUR_TOKEN", footballDataApiToken = "YOUR_TOKEN" } = {}) {
  const sportmonks = buildSportmonksWorldCupFeed(sportmonksApiToken);
  const footballData = buildFootballDataWorldCupFeed(footballDataApiToken);

  return {
    providers: providerRegistry,
    steps: [
      {
        id: "fixture-sync",
        provider: "sportmonks",
        urls: [sportmonks.fixtures],
        useCase: "Populate or refresh all fixtures in the matches table.",
      },
      {
        id: "live-sync",
        provider: "sportmonks",
        urls: [sportmonks.liveLatest],
        useCase: "Mine only changed live matches during active windows.",
      },
      {
        id: "fallback-sync",
        provider: "football-data",
        urls: [footballData.competitionMatches],
        useCase: "Fallback daily result and fixture sync for the cheaper plan.",
      },
    ],
    samples: providerSamples,
  };
}
